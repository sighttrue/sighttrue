import { PROVIDERS } from '../collectors/incidents.ts';
import { incidentAt, incidentMinutes, isSerious, type IncidentRow } from '../types/incidents.ts';

/**
 * Providers side by side, over one window.
 *
 * The comparison is the whole point and it is also the dangerous part. A count
 * measures how often a provider *announced* something, not how often it broke,
 * and the two diverge in a direction that punishes honesty: a company that
 * posts every degradation will out-count one that posts nothing. Anything
 * rendered from this has to say that where the number is, not in a footnote.
 *
 * Length is reported the same way. It is the gap between the two timestamps the
 * provider published, on the rows where they published both — never a mean over
 * rows whose start was unknown, and never a claim about how long anything was
 * actually broken, which nobody outside the provider can measure.
 */

export interface ProviderIncidents {
  slug: string;
  name: string;
  /** Incidents inside the window. */
  count: number;
  /** Of those, how many the provider marked resolved. */
  resolved: number;
  /**
   * Of those, how many carry a status at all.
   *
   * Below `count` where rows were kept from before this read the providers'
   * JSON. Those have no status on record, and the resolved figure has to be
   * read against this rather than against the count.
   */
  withStatus: number;
  /** Of those, how many published both a start and an end. */
  timed: number;
  /** Median announced length in minutes across the `timed` rows, or null. */
  medianMinutes: number | null;
  /**
   * Minutes of the window during which this provider had an incident open.
   *
   * Overlapping incidents are merged, so two open at once count once. This is
   * not downtime and nothing may render it as downtime: an open incident is
   * usually one component or one region, and the clock runs until the provider
   * closes the record, which is after impact ends.
   */
  openMinutes: number;
  /** The same, over the incidents the provider graded major or critical. */
  seriousMinutes: number;
  /** Of `timed`, how many carry a grading at all. The denominator for above. */
  graded: number;
  /** ISO 8601 of the most recent, or null when the window is empty. */
  latestAt: string | null;
  latestTitle: string | null;
}

export interface RecentIncident {
  provider: string;
  name: string;
  title: string;
  /** Start where the provider published one, last update where it did not. */
  at: string;
  /** Which of those `at` is. The page has to say when it is not a start. */
  atKind: 'started' | 'updated';
  /** Announced length in minutes, or null when either end is unpublished. */
  minutes: number | null;
  url: string;
}

export interface IncidentSummary {
  /** Days the counts cover. */
  windowDays: number;
  /** Providers with a record on file, whatever it said. */
  providers: number;
  /** Incidents across every provider inside the window. */
  total: number;
  /** Of those, how many carry both a published start and end. */
  timed: number;
  /** Median announced length in minutes across every timed row, or null. */
  medianMinutes: number | null;
  /** Days of history the oldest row here goes back to. */
  observedDays: number;
  /** Busiest first. Every tracked provider appears, including the quiet ones. */
  byProvider: ProviderIncidents[];
  /** Newest first, across all providers. Bounded — see `RECENT_LIMIT`. */
  recent: RecentIncident[];
}

export const WINDOW_DAYS = 90;
export const RECENT_LIMIT = 12;

/**
 * What the availability targets people quote actually allow, in minutes, over
 * the window this page uses.
 *
 * Here so the page can show the scale a reader already has in their head. They
 * are not thresholds anybody is measured against on this page — see the wording
 * beside them, and `openMinutes` for why the two are different measurements.
 */
export function allowedMinutes(nines: number, windowDays = WINDOW_DAYS): number {
  return Math.round(((100 - nines) / 100) * windowDays * 24 * 60);
}

/** Upper median, so an even count returns a value one of the rows really had. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

/**
 * How much of the clock these intervals cover between them, in minutes.
 *
 * Merged rather than summed, and the difference is not academic: across the
 * providers on file, adding durations overstates by up to 3,277 minutes for one
 * of them — two days invented out of incidents that were open at the same time.
 * A provider that files three overlapping records for one bad afternoon would
 * otherwise be reported as having had three bad afternoons.
 */
export function mergedMinutes(intervals: readonly (readonly [number, number])[]): number {
  const sorted = [...intervals]
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to >= from)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let openFrom: number | null = null;
  let openTo = 0;

  for (const [from, to] of sorted) {
    if (openFrom === null) {
      openFrom = from;
      openTo = to;
    } else if (from <= openTo) {
      openTo = Math.max(openTo, to);
    } else {
      total += openTo - openFrom;
      openFrom = from;
      openTo = to;
    }
  }

  if (openFrom !== null) total += openTo - openFrom;
  return Math.round(total / 60_000);
}

/** The published start and end of one incident, as milliseconds. */
function span(row: IncidentRow): readonly [number, number] | null {
  if (row.startedAt === null || row.resolvedAt === null) return null;
  const from = Date.parse(row.startedAt);
  const to = Date.parse(row.resolvedAt);
  return Number.isNaN(from) || Number.isNaN(to) || to < from ? null : [from, to];
}

export function summariseIncidents(
  rows: readonly IncidentRow[],
  today: string,
  windowDays = WINDOW_DAYS,
): IncidentSummary {
  const now = Date.parse(`${today}T00:00:00Z`);
  const cutoff = now - windowDays * 86_400_000;
  const named = new Map(PROVIDERS.map((provider) => [provider.slug, provider.name]));

  // Dated once, here. A row with no usable timestamp cannot be placed in a
  // window and is not counted into one — it is not dated as today instead.
  //
  // A row the provider graded `maintenance` is a scheduled window and was never
  // an incident. The JSON collector never files one; a handful survive from when
  // this read the RSS history feed, which mixed them in, and counting them would
  // report planned work as an outage.
  const dated = rows
    .filter((row) => row.impact?.toLowerCase() !== 'maintenance')
    .map((row) => ({ row, at: incidentAt(row) }))
    .filter((entry): entry is { row: IncidentRow; at: string } => entry.at !== null);

  const inWindow = dated.filter((entry) => Date.parse(entry.at) >= cutoff);

  const byProvider: ProviderIncidents[] = PROVIDERS.map((provider) => {
    const mine = inWindow
      .filter((entry) => entry.row.provider === provider.slug)
      .sort((a, b) => (a.at < b.at ? 1 : -1));

    const lengths = mine
      .map((entry) => incidentMinutes(entry.row))
      .filter((minutes): minutes is number => minutes !== null);

    const spans = mine
      .map((entry) => span(entry.row))
      .filter((pair): pair is readonly [number, number] => pair !== null);
    const serious = mine
      .filter((entry) => isSerious(entry.row))
      .map((entry) => span(entry.row))
      .filter((pair): pair is readonly [number, number] => pair !== null);

    return {
      slug: provider.slug,
      name: provider.name,
      count: mine.length,
      resolved: mine.filter((entry) => entry.row.resolved === true).length,
      withStatus: mine.filter((entry) => entry.row.resolved !== null).length,
      timed: lengths.length,
      medianMinutes: median(lengths),
      openMinutes: mergedMinutes(spans),
      seriousMinutes: mergedMinutes(serious),
      graded: mine.filter((entry) => entry.row.impact !== null).length,
      latestAt: mine[0]?.at ?? null,
      latestTitle: mine[0]?.row.title ?? null,
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const oldest = dated.reduce(
    (earliest, entry) => Math.min(earliest, Date.parse(entry.at)),
    Number.POSITIVE_INFINITY,
  );

  const recent = [...inWindow]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, RECENT_LIMIT)
    .map(({ row, at }) => ({
      provider: row.provider,
      name: named.get(row.provider) ?? row.provider,
      title: row.title,
      at,
      atKind: row.startedAt === null ? ('updated' as const) : ('started' as const),
      minutes: incidentMinutes(row),
      url: row.url,
    }));

  const allLengths = inWindow
    .map((entry) => incidentMinutes(entry.row))
    .filter((minutes): minutes is number => minutes !== null);

  return {
    windowDays,
    providers: PROVIDERS.length,
    total: inWindow.length,
    timed: allLengths.length,
    medianMinutes: median(allLengths),
    observedDays: Number.isFinite(oldest) ? Math.max(0, Math.round((now - oldest) / 86_400_000)) : 0,
    byProvider,
    recent,
  };
}
