/**
 * Payment an agent can complete without a person.
 *
 * This is the one argument for a token here that a card cannot answer. The
 * customer this product is acquiring is an autonomous agent calling the MCP
 * server, and an agent has no card, no billing address and no way through a 3DS
 * challenge. It can hold a wallet. So the payment rail is not decoration on top
 * of a subscription — for this buyer it is the only rail that exists.
 *
 * x402 is HTTP's own answer: the server replies 402 with what it wants, the
 * client pays, and retries carrying proof. No account, no signup, no human in
 * the loop at any point.
 *
 * Built to the published shape rather than invented: `PAYMENT-REQUIRED` on the
 * refusal, `PAYMENT-PAYLOAD` as base64 JSON on the retry, and the `bazaar`
 * extension so the tool is discoverable by agents that have not been told it
 * exists. Every field name here is theirs.
 *
 * Pure. The endpoint calls in and does the network and database work.
 */

import type { McpTool } from './mcp-catalogue.ts';

/** Set once the token exists. Until then nothing here can quote a price. */
export interface PaymentConfig {
  /** The $SGHT contract. Null until it is deployed. */
  asset: string | null;
  /** Where payment is sent. Null until the receiving wallet is chosen. */
  payTo: string | null;
  /** Chain the asset lives on, as x402 names it. */
  network: string;
  /** Token units for one credit, as a decimal string. Null until a rate is set. */
  pricePerCall: string | null;
  /** Decimals of the asset, so a client can size the transfer. */
  decimals: number | null;
}

export const NOT_LAUNCHED: PaymentConfig = {
  asset: null,
  payTo: null,
  network: 'robinhood',
  pricePerCall: null,
  decimals: null,
};

/** Whether this configuration can actually ask anybody for money. */
export function canCharge(config: PaymentConfig): boolean {
  return (
    config.asset !== null &&
    config.payTo !== null &&
    config.pricePerCall !== null &&
    config.decimals !== null
  );
}

export interface PaymentRequired {
  x402Version: number;
  accepts: {
    scheme: string;
    network: string;
    asset: string;
    payTo: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    maxTimeoutSeconds: number;
    extensions: {
      bazaar: {
        info: {
          input: { type: string; method: string; queryParams: Record<string, unknown> };
          output: { type: string; example: Record<string, unknown> };
        };
      };
    };
  }[];
}

/**
 * What the server asks for, and what makes the tool findable.
 *
 * The `bazaar` extension is not padding. An agent that has never heard of this
 * service can list the directory, see a tool that answers the question it has,
 * and pay for one call — which is a distribution channel no amount of writing
 * on a website reaches.
 */
export function paymentRequired(
  tool: McpTool,
  origin: string,
  config: PaymentConfig,
): PaymentRequired | null {
  if (!canCharge(config)) return null;

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: config.network,
        asset: config.asset as string,
        payTo: config.payTo as string,
        // The tool's own price, not a flat rate. Multiplied here rather than
        // stored in the catalogue, because the catalogue holds credits and the
        // token rate belongs to the rail — one changes when a tool is repriced,
        // the other when the token moves, and they must not be the same field.
        maxAmountRequired: (BigInt(config.pricePerCall as string) * BigInt(tool.credits)).toString(),
        resource: `${origin}/api/mcp#${tool.name}`,
        // The tool's own sentence. An agent choosing what to pay for reads this
        // and nothing else, so it must say what is returned rather than sell it.
        description: tool.description,
        mimeType: 'application/json',
        maxTimeoutSeconds: 60,
        extensions: {
          bazaar: {
            info: {
              input: { type: 'http', method: 'POST', queryParams: tool.properties },
              output: { type: 'json', example: { covered: true, readings: {} } },
            },
          },
        },
      },
    ],
  };
}

/**
 * The proof of payment a client retries with.
 *
 * Decoded rather than trusted: this returns what the header claims, and the
 * caller still has to verify the transfer on chain before answering. A payload
 * that parses is a claim, not a payment — `payments.ts` decides the rest, and
 * it already requires twelve confirmations.
 */
export function decodePayment(header: string | null): Record<string, unknown> | null {
  if (header === null || header.trim() === '') return null;

  try {
    const json = atob(header.trim());
    const parsed = JSON.parse(json) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // Malformed is refused rather than repaired. A client that cannot encode
    // its own receipt has not paid.
    return null;
  }
}

/**
 * The line the site can honestly print before a token exists.
 *
 * Stated rather than hidden, because a paid surface that will not say whether
 * it can take money yet is the one thing on this project a reader cannot check.
 */
export function paymentStatus(config: PaymentConfig): string {
  return canCharge(config)
    ? `Paid tools cost ${config.pricePerCall} per call, settled on ${config.network}.`
    : 'Paid tools are declared and refused. There is no price and no contract address, so nothing here can take payment yet.';
}
