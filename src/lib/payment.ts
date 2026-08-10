/**
 * The token, and the rail that will charge in it. One place, two facts.
 *
 * They are separate on purpose and the site says both, because on launch day
 * they were different: the contract existed and was tradeable within the hour,
 * while the receiving wallet and the rate were still decisions nobody had made.
 * A single "launched" boolean would have forced the page to pick one of two
 * true statements and print the other as a lie.
 *
 * ## What each is for
 *
 * `TOKEN` is what the chain says. Null before deployment; afterwards the
 * address anybody needs in order to trade, with the decimals read from the
 * contract rather than assumed.
 *
 * `PAYMENT` is what this deployment is willing to charge. `canCharge` refuses
 * until all four fields are present and the network is the one the verifier
 * actually reads, so a half-configured rail quotes nothing at all.
 */

import { CHAIN_NETWORK } from './chain.ts';
import { NOT_LAUNCHED, canCharge, type PaymentConfig } from './x402.ts';

export interface TokenFacts {
  symbol: string;
  /** The contract, exactly as the explorer reports it. Never abbreviated. */
  address: string;
  /** Read from the contract's own `decimals()`, not assumed. */
  decimals: number;
  /**
   * True while Virtuals still reports `tokenAddress: null` — the token is on
   * its bonding curve and this address is replaced if it graduates.
   *
   * Stated everywhere the address is, because the failure it prevents is
   * somebody sending to a dead address weeks later from a screenshot.
   */
  preGraduation: boolean;
  /** Where it can be traded and where the record of it lives. */
  launchpad: { name: string; url: string };
}

/** Deployed 2026-08-10. Verified against the contract and the launchpad record. */
export const TOKEN: TokenFacts | null = {
  symbol: '$SGHT',
  address: '0x9288a2961368cCebF2E2509a877Eb8EE578857fc',
  decimals: 18,
  preGraduation: true,
  launchpad: { name: 'Virtuals', url: 'https://app.virtuals.io/virtuals/131567' },
};

/**
 * The rail. Two fields still empty, and both are the maintainer's to fill:
 * which wallet receives payment, and how many token units buy one credit.
 *
 * Until they are, `canCharge` is false, `paymentRequired` returns null, and the
 * MCP server refuses paid tools in words rather than quoting terms nobody set.
 * The free tools are unaffected — they always were.
 */
export const PAYMENT: PaymentConfig = {
  ...NOT_LAUNCHED,
  asset: TOKEN?.address ?? null,
  network: TOKEN === null ? null : CHAIN_NETWORK,
  decimals: TOKEN?.decimals ?? null,
};

/** Whether this deployment can actually take money. */
export const CHARGING: boolean = canCharge(PAYMENT);

/**
 * What the site says about its own funding, from the two facts above.
 *
 * Typed as prose in two separate pages before this, which meant launch day
 * would have left both of them announcing that no token existed while the
 * contract traded.
 */
export function launchSentence(): string {
  if (TOKEN === null) {
    return 'It has not launched. When it does, the contract address will appear here and nowhere else.';
  }

  const where = `on ${TOKEN.launchpad.name}, ${CHAIN_NETWORK === 'robinhood' ? 'Robinhood Chain' : CHAIN_NETWORK}`;
  const curve = TOKEN.preGraduation
    ? ' It is still on its bonding curve, so that address is replaced if it graduates.'
    : '';
  const rail = CHARGING
    ? ' Paid tools take payment in it.'
    : ' The payment rail is not charging yet: no wallet and no rate are set, so every tool is still free.';

  return `It launched ${where} — ${TOKEN.address}.${curve}${rail}`;
}
