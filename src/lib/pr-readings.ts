/**
 * What the pull-request bot says, and when it says nothing.
 *
 * Pure. The webhook does the network work and calls in here for every decision,
 * which is the only way this part can be tested at the level it needs to be: a
 * bot that comments wrongly does it under this project's name, in a stranger's
 * repository, where nobody here can take it back. Silence is a correct outcome
 * and the common one.
 *
 * Three rules hold the whole thing up:
 *
 *   1. Read the manifest, not the diff. Patch hunks arrive without the context
 *      that says whether a line is a dependency or a script, and the project has
 *      already been caught once by a pattern that matched the thing next to what
 *      it was measuring. Both versions of the file are fetched and parsed by the
 *      same reader the collector uses, and the difference between them is the
 *      answer.
 *   2. Report readings, never verdicts. Every number here is one this project
 *      already publishes, with the same wording and the same limits attached.
 *      Nothing is called safe, unsafe, risky or recommended.
 *   3. Say nothing unless there is something on record. A package that is not on
 *      the watchlist is not being judged, and a pull request that adds none of
 *      them gets no comment at all.
 */

import { foldName, type Registry } from './watchlist-api.ts';

/**
 * The marker that makes the next push edit this comment instead of adding one.
 *
 * An HTML comment, so it is invisible in the rendered thread but exact to match
 * on. A bot that appends is a bot that produces twelve comments on a branch
 * somebody rebased twelve times.
 */
export const MARKER = '<!-- sighttrue:readings -->';

/** Manifests this can read, and the registry each one names packages in. */
const MANIFESTS: Record<string, Registry> = {
  'package.json': 'npm',
  'requirements.txt': 'pypi',
  'pyproject.toml': 'pypi',
  'Cargo.toml': 'crates',
};

/**
 * Paths that look like manifests and are not the project's own.
 *
 * A test fixture named `package.json` describes nothing anybody is installing,
 * and commenting on one is noise in a pull request that has nothing to do with
 * dependencies.
 */
const NOT_A_MANIFEST = /(^|\/)(node_modules|vendor|third_party|fixtures?|testdata|examples?)\//i;

/** How many manifests one pull request may be read from. */
export const MAX_MANIFESTS = 5;

/** How many rows the comment shows before it stops and says how many are left. */
export const MAX_ROWS = 15;

export function registryFor(path: string): Registry | null {
  if (NOT_A_MANIFEST.test(path)) return null;
  const name = path.split('/').pop() ?? '';
  return MANIFESTS[name] ?? null;
}

export function manifestName(path: string): string {
  return path.split('/').pop() ?? '';
}

export interface StackEntry {
  repo: string;
  installs: number | null;
  scorecard: number | null;
  advisories: number | null;
  license: string | null;
  archived: boolean;
  pushedAt: string | null;
}

export interface StackIndex {
  benchmark: { repositories: number; medianScorecard: number | null; scored: number };
  packages: Record<string, StackEntry>;
}

export interface Added {
  registry: Registry;
  /** As the manifest spells it. What a reader will search the diff for. */
  name: string;
  /** Which file it was added to. */
  path: string;
}

export interface Reading extends Added {
  /**
   * The index key this matched, `registry:name`.
   *
   * The link is built from this rather than from the name in the manifest,
   * because the page is built from this too. `PyYAML` in somebody's
   * requirements.txt and `pypi:pyyaml` in the index are the same package, and
   * only one of those two spellings has a page.
   */
  key: string;
  entry: StackEntry;
}

/**
 * The added packages this project has a reading for.
 *
 * Folded before lookup for the same reason the watchlist folds: `PyYAML` and
 * `pyyaml` are one package, and missing the match would report a covered
 * package as untracked.
 */
export function readingsFor(added: readonly Added[], index: StackIndex): Reading[] {
  const seen = new Set<string>();
  const found: Reading[] = [];

  for (const item of added) {
    const key = `${item.registry}:${foldName(item.registry, item.name)}`;
    if (seen.has(key)) continue;

    const entry = index.packages[key];
    if (entry === undefined) continue;

    seen.add(key);
    found.push({ ...item, key, entry });
  }

  return found.sort((a, b) => a.name.localeCompare(b.name));
}

/** A licence that is not open source however much it reads like one. */
const SOURCE_AVAILABLE = /BUSL|SSPL|Elastic|RSAL|Commons-Clause|PolyForm/i;

function escapeCell(value: string): string {
  // A package name cannot contain a pipe, but this text goes into a table in
  // somebody else's repository and the cost of being sure is one replace.
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function downloads(value: number | null): string {
  if (value === null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

function pushedAge(iso: string | null, now: number): string {
  if (iso === null) return '—';
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '—';
  const days = Math.round((now - at) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 60) return `${days}d`;
  if (days < 730) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/**
 * The facts worth putting beside a package, in the provider's own terms.
 *
 * Archived and source-available are stated because they change what accepting
 * the dependency means and neither is visible from the version range in the
 * diff. Neither is a recommendation: an archived project can be finished, and a
 * source-available licence is a licensing fact, not a quality one.
 */
function notes(entry: StackEntry): string {
  const said: string[] = [];
  if (entry.archived) said.push('archived');
  if (entry.license !== null && SOURCE_AVAILABLE.test(entry.license)) said.push('source-available');
  return said.join(', ');
}

export interface CommentOptions {
  readings: readonly Reading[];
  /** Every package added, including the ones with no reading here. */
  added: readonly Added[];
  index: StackIndex;
  /** When the readings behind this were taken. */
  readAt: string | null;
  site: string;
  now?: number;
}

/**
 * One comment, or nothing.
 *
 * Returns null when there is nothing on record to say, and the caller posts
 * nothing at all rather than a comment reporting that it found nothing. An
 * empty finding is a finding nobody asked for.
 */
export function commentBody(options: CommentOptions): string | null {
  const { readings, added, index, readAt, site } = options;
  if (readings.length === 0) return null;

  const now = options.now ?? Date.now();
  const shown = readings.slice(0, MAX_ROWS);
  const untracked = added.length - readings.length;

  const rows = shown
    .map((reading) => {
      const { entry } = reading;
      return `| [${escapeCell(reading.name)}](${site}/${reading.key.replace(':', '/')}) | ${downloads(entry.installs)} | ${
        entry.scorecard === null ? '—' : entry.scorecard.toFixed(1)
      } | ${entry.advisories === null ? '—' : entry.advisories} | ${
        entry.license === null ? '—' : escapeCell(entry.license)
      } | ${pushedAge(entry.pushedAt, now)} | ${notes(entry) || '—'} |`;
    })
    .join('\n');

  const more =
    readings.length > shown.length
      ? `\n\n${readings.length - shown.length} more tracked packages were added and are not listed here.`
      : '';

  const median = index.benchmark.medianScorecard;

  return `${MARKER}
**${readings.length} ${readings.length === 1 ? 'dependency' : 'dependencies'} added here ${
    readings.length === 1 ? 'is' : 'are'
  } tracked by [Sighttrue](${site}).** Readings, not advice.

| Package | Weekly downloads | Scorecard | Advisories | Licence | Last push | Notes |
|---|---|---|---|---|---|---|
${rows}${more}

<details><summary>What these numbers are, and are not</summary>

- **Scorecard** is the OpenSSF Scorecard published by Google Open Source Insights, not computed here. It measures declared practices such as code review and workflow permissions. A low score is not a statement that a project is unsafe.${
    median === null
      ? ''
      : ` The median across ${index.benchmark.repositories} tracked repositories is ${median.toFixed(1)}.`
  }
- **Advisories** are OSV totals for all time, so a mature, well-patched project carries more than a young one. A high count is not a warning on its own.
- **Last push** is to the repository that publishes the package, not to the package.
- Only runtime dependencies are read. Development and optional dependencies are not compared.
- The watchlist is curated and partial — around ${index.benchmark.repositories} repositories chosen by hand.${
    untracked > 0
      ? ` ${untracked} other ${untracked === 1 ? 'dependency' : 'dependencies'} added here ${
          untracked === 1 ? 'is' : 'are'
        } not tracked, which is not a judgement about ${untracked === 1 ? 'it' : 'them'}.`
      : ''
  }
- Readings are taken every four hours at best${readAt === null ? '' : `, most recently ${readAt}`}. Nothing here is live.

</details>`;
}
