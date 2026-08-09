/**
 * What a caller is allowed to reach, decided once.
 *
 * Pure on purpose. This is the only place in the project where being wrong
 * costs somebody money or gives away what they paid for, and a rule that lives
 * inside a request handler can only be tested by making requests.
 *
 * The database enforces identity and money — `migrations/0001_init.sql` holds
 * the uniqueness constraints, because a check in application code is a race
 * condition with good intentions. This decides access given a row that has
 * already been read.
 */

import type { Tier } from './mcp-catalogue.ts';

/** The entitlement row, as the database stores it. */
export interface EntitlementRow {
  planId: string;
  /** ISO 8601. Null for credit packs, which do not expire. */
  validUntil: string | null;
  /** Null for subscriptions, which are not metered by call. */
  callsRemaining: number | null;
}

export type Refusal =
  | { allowed: false; reason: 'no-key'; status: 401; message: string }
  | { allowed: false; reason: 'unknown-key'; status: 401; message: string }
  | { allowed: false; reason: 'expired'; status: 402; message: string }
  | { allowed: false; reason: 'no-credit'; status: 402; message: string };

export type Decision =
  | { allowed: true; tier: Tier; planId: string; spendsCredit: boolean }
  | Refusal;

/**
 * Whether this caller may run a tool of this tier.
 *
 * A free tool is never refused, not even for an expired key or a wrong one.
 * Anything already given away stays given away, and a caller whose subscription
 * lapsed keeps everything they had before they ever paid — the alternative is
 * an instrument that takes a published reading back, which is the one thing
 * this project cannot be caught doing.
 */
export function decide(
  tier: Tier,
  entitlement: EntitlementRow | null,
  now: string,
): Decision {
  if (tier === 'free') {
    return { allowed: true, tier: 'free', planId: entitlement?.planId ?? 'free', spendsCredit: false };
  }

  if (entitlement === null) {
    return {
      allowed: false,
      reason: 'no-key',
      status: 401,
      // Says what to do, not only what went wrong. An agent reading this is the
      // one that has to decide whether to tell its user to go and buy access.
      message:
        'This reading needs a key. The free tools need none and are listed by list_readings. See https://sighttrue.com/pricing.',
    };
  }

  // A credit pack has no expiry and a subscription has no call meter, so the
  // two are checked separately rather than folded into one condition that
  // happens to work for both.
  if (entitlement.validUntil !== null && entitlement.validUntil <= now) {
    return {
      allowed: false,
      reason: 'expired',
      status: 402,
      message: `That key's access ended on ${entitlement.validUntil.slice(0, 10)}. The free tools still work.`,
    };
  }

  if (entitlement.callsRemaining !== null && entitlement.callsRemaining <= 0) {
    return {
      allowed: false,
      reason: 'no-credit',
      status: 402,
      message: 'That key has no calls left. The free tools still work.',
    };
  }

  return {
    allowed: true,
    tier: 'paid',
    planId: entitlement.planId,
    // Only a metered plan spends anything. A subscription answering a call is
    // not a decrement, and treating it as one would empty a column that should
    // stay null for the life of the account.
    spendsCredit: entitlement.callsRemaining !== null,
  };
}

/**
 * The key out of an Authorization header.
 *
 * Bearer only, and the scheme is compared case-insensitively because the RFC
 * says so and clients differ. Anything else returns null rather than being
 * repaired into something that might match a stored hash.
 */
export function bearerFrom(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match === null ? null : (match[1] as string);
}
