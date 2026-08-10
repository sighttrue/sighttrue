import { describe, expect, it } from 'vitest';

import { toolByName } from '../src/lib/mcp-catalogue.ts';
import {
  canCharge,
  decodePayment,
  NOT_LAUNCHED,
  paymentRequired,
  paymentStatus,
  type PaymentConfig,
} from '../src/lib/x402.ts';

/**
 * The rail an agent can use on its own.
 *
 * A card cannot be used by the buyer this product is acquiring: an autonomous
 * agent has no billing address and cannot answer a 3DS challenge. So the tests
 * here are mostly about refusing to quote a price that does not exist yet,
 * because a payment surface that invents its own terms is worse than one that
 * says it is not ready.
 */

const LIVE: PaymentConfig = {
  asset: '0x0000000000000000000000000000000000000001',
  payTo: '0x0000000000000000000000000000000000000002',
  network: 'robinhood',
  pricePerCall: '1000000000000000000',
  decimals: 18,
};

describe('before the token exists', () => {
  it('cannot charge, and says so rather than quoting nothing', () => {
    expect(canCharge(NOT_LAUNCHED)).toBe(false);
    expect(paymentRequired(toolByName('who_can_publish')!, 'https://sighttrue.com', NOT_LAUNCHED)).toBeNull();
  });

  it('refuses a half-configured rail as firmly as an empty one', () => {
    // A contract address with no rate, or a rate with nowhere to send it, is
    // the shape a launch is in for an afternoon. Charging during that window
    // would take money against terms nobody set.
    for (const missing of ['asset', 'network', 'payTo', 'pricePerCall', 'decimals'] as const) {
      expect(canCharge({ ...LIVE, [missing]: null }), `missing ${missing}`).toBe(false);
    }
  });

  it('states the position in words a reader can check', () => {
    expect(paymentStatus(NOT_LAUNCHED)).toContain('no contract address');
    expect(paymentStatus(LIVE)).toContain('per call');
  });

  it('refuses a chain it does not verify, however complete the rest is', () => {
    // The failure this prevents is silent and unrecoverable. Verification reads
    // a receipt from one chain; a config naming another would quote that chain
    // in the 402, the buyer would send a real transfer to it, and the server
    // would then look for the transaction somewhere it was never sent. Nothing
    // errors. The buyer has paid and simply does not get an answer.
    //
    // Every other field being filled in is exactly when this is most likely: a
    // launch sets the contract, the wallet and the rate, and leaves the network
    // reading whatever it read while the chain was still being decided.
    for (const network of ['base', 'ethereum', 'solana', 'Robinhood', '']) {
      expect(canCharge({ ...LIVE, network }), network || '(empty)').toBe(false);
    }
  });
});

describe('what the server asks for', () => {
  const required = paymentRequired(toolByName('time_to_fix')!, 'https://sighttrue.com', LIVE);

  it('names the asset, the recipient and the amount', () => {
    const accept = required?.accepts[0];
    expect(accept?.asset).toBe(LIVE.asset);
    expect(accept?.payTo).toBe(LIVE.payTo);
    expect(accept?.network).toBe('robinhood');
  });

  it('publishes the chain id too, so the name never has to be guessed', () => {
    // 'robinhood' is a word. eip155:4663 is an address. A buyer that has never
    // heard of this network can act on the second and not on the first.
    expect(required?.accepts[0]?.extensions.chain.caip2).toBe('eip155:4663');
  });

  it('charges the tool’s own price rather than a flat rate', () => {
    // time_to_fix rests on the archive: advisory dates against release dates,
    // which cannot be reconstructed after the fact. check_eol restates what
    // endoflife.date publishes. Charging both the same says the first is worth
    // as little as the second.
    const archival = toolByName('time_to_fix')!;
    const convenience = toolByName('typosquat_check')!;

    expect(archival.credits).toBeGreaterThan(convenience.credits);

    const dear = paymentRequired(archival, 'https://sighttrue.com', LIVE);
    expect(dear?.accepts[0]?.maxAmountRequired).toBe(
      (BigInt(LIVE.pricePerCall as string) * BigInt(archival.credits)).toString(),
    );
  });

  it('never asks a free tool for money', () => {
    // Nine tools shipped keyless. A price on one of them would be the promise
    // being withdrawn, whatever the amount.
    for (const name of ['check_before_install', 'check_eol', 'find_model']) {
      expect(toolByName(name)?.credits, `${name} must cost nothing`).toBe(0);
    }
  });

  it('points at the tool it is charging for, not at the server', () => {
    // An agent paying for one reading must be able to tell what it bought.
    expect(required?.accepts[0]?.resource).toContain('#time_to_fix');
  });

  it('carries the bazaar extension, which is the distribution', () => {
    // An agent that has never heard of this can list the directory, find a tool
    // answering the question it has, and pay for one call. No amount of writing
    // on a website reaches that reader.
    const info = required?.accepts[0]?.extensions.bazaar.info;
    expect(info?.input.type).toBe('http');
    expect(info?.output.type).toBe('json');
  });

  it('describes the tool without selling it', () => {
    const description = required?.accepts[0]?.description ?? '';
    expect(description.length).toBeGreaterThan(40);
    for (const word of ['best', 'powerful', 'recommended']) {
      expect(description.toLowerCase()).not.toContain(word);
    }
  });
});

describe('the receipt a client retries with', () => {
  it('decodes a base64 payload', () => {
    const payload = { transaction: '0xabc', network: 'robinhood' };
    expect(decodePayment(btoa(JSON.stringify(payload)))).toEqual(payload);
  });

  it('refuses anything malformed rather than repairing it', () => {
    // A client that cannot encode its own receipt has not paid.
    for (const header of [null, '', '   ', 'not-base64!!', btoa('not json'), btoa('"a string"')]) {
      expect(decodePayment(header)).toBeNull();
    }
  });

  it('is a claim rather than a payment, and the name says so', () => {
    // Decoding proves the header parses. Whether money moved is settled on
    // chain by payments.ts, which requires twelve confirmations.
    expect(decodePayment(btoa(JSON.stringify({ transaction: '0xdeadbeef' })))).toEqual({
      transaction: '0xdeadbeef',
    });
  });
});
