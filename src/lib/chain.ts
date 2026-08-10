/**
 * The chain, described once.
 *
 * Its identity was held in three places that each knew a different part of it:
 * `functions/api/chain.ts` had the numeric id and the RPC endpoints, the
 * Blockscout URL had the id again inside a string, and the payment config had
 * the name `'robinhood'` with no way to tell which chain that referred to. The
 * registries table exists because nineteen files once disagreed about npm; this
 * is the same shape of mistake on the one path where being wrong costs somebody
 * money rather than an inaccurate row.
 *
 * A buyer's agent reads `network` out of a 402 body and sends a transfer. If
 * that name resolves to a chain this deployment does not read, the transfer
 * lands somewhere nothing is watching, the payment never verifies, and it does
 * not come back. So the name, the id and the endpoints that confirm the id are
 * one object, and everything that needs any of them reads it from here.
 */

/** EIP-155 chain id. Every probe checks the endpoint answers with this. */
export const CHAIN_ID = 4663;

/**
 * The name quoted in a 402 body, as x402 spells a network.
 *
 * A bare word, because that is the field's shape. `CHAIN_CAIP2` is published
 * beside it for anything that would otherwise have to guess what the word means.
 */
export const CHAIN_NETWORK = 'robinhood';

/**
 * The same chain, unambiguously.
 *
 * CAIP-2 is `namespace:reference` and resolves without a lookup table, which a
 * bare name does not. Published in the 402 body next to the name so a client
 * that has never heard of this network can still address it correctly.
 */
export const CHAIN_CAIP2 = `eip155:${CHAIN_ID}`;

/**
 * JSON-RPC endpoints, in order of preference.
 *
 * More than one on purpose. A single hardcoded provider is a single point of
 * failure for the one part of this system where failing means somebody paid and
 * got nothing.
 */
export const RPC_ENDPOINTS = [
  'https://rpc.mainnet.chain.robinhood.com',
  'https://robinhoodchain.blockscout.com/api/eth-rpc',
] as const;

/**
 * Blockscout's REST reader, and the reason it exists.
 *
 * Both public JSON-RPC endpoints answer 429 from a Worker — consistently, three
 * probes apart. That is not an outage: Workers egress from addresses shared with
 * millions of other sites, and a public RPC rate-limits by address, so the quota
 * is spent by strangers before this project asks for anything. It will not
 * improve. A key moves the limit from the address to the key.
 *
 * The id is interpolated rather than typed into the string, which is how it came
 * to be written down twice in the first place.
 */
export const BLOCKSCOUT = `https://api.blockscout.com/${CHAIN_ID}/api/v2`;
