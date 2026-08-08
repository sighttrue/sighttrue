import type { AssertExhaustive } from './keys.ts';

/**
 * The two series this project was throwing away.
 *
 * Model prices and download counts are both kept inline on their live row as a
 * 35-day trend, pruned on every run. `history/` holds forks, stars and open
 * issues and nothing else. So the answer to "what did this model cost three
 * months ago" or "was this package growing when we adopted it" was being
 * deleted on a rolling basis, every day, permanently.
 *
 * That is the one loss in this project that gets worse by waiting. Every other
 * unbuilt thing costs the same whenever it is built; a day of prices not
 * archived is a day nobody can ever answer for.
 *
 * Append-only and monthly, like `events/`. Never rewritten, never pruned.
 */

/**
 * One model's price, on the day it changed.
 *
 * Written only when a price differs from the last archived one, which is the
 * same rule `window.jsonl` uses for fork samples: a model whose price has not
 * moved produces no line, so a year of stable pricing costs one row.
 */
export interface PriceRow {
  /** Provider-qualified model id, as the catalogue spells it. */
  id: string;
  /** ISO 8601 UTC of the reading that first saw this price. */
  at: string;
  /** USD per million prompt tokens. Null when the catalogue stated none. */
  prompt: number | null;
  /** USD per million completion tokens. */
  completion: number | null;
  /** Context window in tokens, which moves with pricing often enough to keep. */
  context: number | null;
}

export const PRICE_KEYS = [
  'id',
  'at',
  'prompt',
  'completion',
  'context',
] as const satisfies readonly (keyof PriceRow)[];

export type _PriceKeysExhaustive = AssertExhaustive<
  Exclude<keyof PriceRow, (typeof PRICE_KEYS)[number]>
>;

/**
 * One package's download count, once a day.
 *
 * Unlike a price, this moves every day by nature, so there is no change rule to
 * apply — a row per package per day is the reading. At the current corpus that
 * is roughly 250 short lines a day, which compresses to very little and buys a
 * series nobody else keeps.
 */
export interface DownloadRow {
  registry: string;
  name: string;
  /** `YYYY-MM-DD` UTC. One row per package per day, at most. */
  date: string;
  count: number;
  /** The period the count covers. npm and PyPI report a week, crates 90 days. */
  window: string;
}

export const DOWNLOAD_KEYS = [
  'registry',
  'name',
  'date',
  'count',
  'window',
] as const satisfies readonly (keyof DownloadRow)[];

export type _DownloadKeysExhaustive = AssertExhaustive<
  Exclude<keyof DownloadRow, (typeof DOWNLOAD_KEYS)[number]>
>;
