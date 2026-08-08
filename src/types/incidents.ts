import type { AssertExhaustive } from './keys.ts';

/**
 * One incident, as its own provider announced it.
 *
 * Nothing here is judged or scored. A provider publishes an incident record,
 * this keeps it, and the only thing added is that the records outlive the feed —
 * Statuspage carries fifty and then forgets, so "how often does this one
 * actually go down" has no answer anywhere a season later.
 *
 * Three timestamps rather than one, because the RSS feed this used to read
 * carried only the last of them and stored it under the name of the first. See
 * `collectors/incidents.ts` for what that cost.
 */
export interface IncidentRow {
  /** Slug, as this project spells it. Stable across a provider's renames. */
  provider: string;
  /** The incident's own page URL. Deduplicates across runs. */
  id: string;
  title: string;
  /**
   * ISO 8601 UTC when the provider says it began.
   *
   * Null for rows kept from the RSS era, where the feed published no start time
   * at all and none can be recovered — those carry `updatedAt` alone. A null
   * here means unknown, never zero.
   */
  startedAt: string | null;
  /**
   * ISO 8601 UTC when the provider marked it resolved, or null.
   *
   * Null covers three different things — still going, never closed out, and
   * closed without a timestamp (Heroku does this) — so it is not the field to
   * read for whether an incident ended. That is `resolved`.
   */
  resolvedAt: string | null;
  /**
   * ISO 8601 UTC of the provider's last update to the record. Always present.
   *
   * The only timestamp every source carries, which makes it the one thing every
   * row can be ordered and windowed by when `startedAt` is unknown.
   */
  updatedAt: string;
  /**
   * Whether the provider marked it resolved, or null when there is no status on
   * record at all.
   *
   * `false` is their own word: an unresolved incident is either ongoing or one
   * they never closed out, and this cannot tell those apart, so it says
   * unresolved rather than guessing which. `null` is a different thing and has
   * to stay distinguishable from `false` — it means this project never had a
   * status for the row, which is true of the RSS-era rows whose provider no
   * longer serves the incident. Counting those as unresolved would publish "66
   * OpenAI incidents were never closed" out of a parser's shortcoming.
   */
  resolved: boolean | null;
  url: string;
}

export const INCIDENT_KEYS = [
  'provider',
  'id',
  'title',
  'startedAt',
  'resolvedAt',
  'updatedAt',
  'resolved',
  'url',
] as const satisfies readonly (keyof IncidentRow)[];

export type _IncidentKeysExhaustive = AssertExhaustive<
  Exclude<keyof IncidentRow, (typeof INCIDENT_KEYS)[number]>
>;

/**
 * When the incident sits in time, for ordering and windowing.
 *
 * The real start where the provider published one, and the last update where it
 * did not. Never invented: a row with neither is not placeable and callers drop
 * it rather than dating it.
 */
export function incidentAt(row: IncidentRow): string | null {
  const at = row.startedAt ?? row.updatedAt ?? null;
  return typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : null;
}

/**
 * How long the provider said it lasted, in minutes, or null.
 *
 * Both ends have to be published. A duration measured from a start this project
 * guessed would be a fabricated number wearing a real one's clothes.
 */
export function incidentMinutes(row: IncidentRow): number | null {
  if (row.startedAt === null || row.resolvedAt === null) return null;
  const from = Date.parse(row.startedAt);
  const to = Date.parse(row.resolvedAt);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 60_000);
}
