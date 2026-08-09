/**
 * Publishing the daily archive.
 *
 * `data/history/` is the one part of this project that cannot be rebuilt. Every
 * other ledger is a reading of something still published: delete
 * `live/state.jsonl` and the next pulse restores it. Delete a day of history and
 * that day is gone, because GitHub does not publish what a repository's star
 * count was last Tuesday — only what it is now.
 *
 * The build already reads these files, for the fork baseline and the sparkline
 * on every repository page. What it did not do was publish them. So the one
 * dataset here that nobody else has, and that this project's whole argument
 * rests on keeping, was reachable only by cloning the repository and reading
 * JSONL by hand — while `/dataset` described eleven bundles that can each be
 * regenerated from scratch tomorrow.
 *
 * Counts only: stars, forks, open issues. Not licences — a licence change is
 * recorded as an event and has a page of its own, because it is a thing that
 * happened rather than a number that moved.
 *
 * Pure. The caller does the reading and the writing.
 */

export interface ArchiveDay {
  /** `YYYY-MM-DD` UTC, and the filename it is published under. */
  date: string;
  /** Repositories recorded that day. */
  rows: number;
  /** Bytes of the published file, so a client knows the cost before fetching. */
  bytes: number;
}

export interface ArchiveIndex {
  /** Newest first. */
  days: ArchiveDay[];
  /** Oldest and newest dates held, or null on an empty archive. */
  from: string | null;
  to: string | null;
  /** Rows across every day. */
  rows: number;
  /** Days actually on file, which is not the span between `from` and `to`. */
  measured: number;
}

/**
 * The index that makes the archive usable without cloning anything.
 *
 * Newest first: somebody arriving at a list of dates wants the most recent, and
 * somebody writing a script wants a stable order. Sorting serves both; leaving
 * it in directory order serves only the second, and only by accident.
 */
export function archiveIndex(days: readonly ArchiveDay[]): ArchiveIndex {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    days: sorted,
    // Read off the data rather than off a constant. An archive that claims to
    // start in January because a constant says January is exactly the failure
    // this project exists to point at in other people's dashboards.
    from: sorted.at(-1)?.date ?? null,
    to: sorted[0]?.date ?? null,
    rows: sorted.reduce((total, day) => total + day.rows, 0),
    // Stated separately from the span on purpose. A run that fails writes no
    // snapshot, so days on file and days between the endpoints are different
    // numbers, and only one of them is a claim about what is here.
    measured: sorted.length,
  };
}
