/**
 * When a package was last shipped, as opposed to last committed to.
 *
 * Every "is this maintained?" answer in circulation reads a repository's last
 * push. That is the wrong field. A push is what a maintainer does for
 * themselves; a publish is what reaches the two hundred projects depending on
 * them, and the two come apart all the time — an active repository whose
 * package has not moved in two years is the common shape of an abandoned
 * dependency, and it looks healthy on every badge there is.
 *
 * Read from the registries themselves, so nothing here depends on GitHub. The
 * package list is the one already mapped for download counts.
 */

import type { AdoptionRow } from '../types/adoption.ts';
import type { EventRecord } from '../types/events.ts';
import type { StalenessRow } from '../types/staleness.ts';
import { sleep, ThrottledError } from '../lib/registries.ts';

const USER_AGENT = 'sighttrue-agent (+https://github.com/sighttrue/sighttrue)';

/**
 * Homebrew is absent. A formula has a version but no publish date of its own —
 * it records when somebody packaged software, not when the software shipped —
 * and reporting that as a release date would be a different fact wearing this
 * one's label.
 */
export const REGISTRIES = ['npm', 'pypi', 'crates', 'gem', 'packagist', 'nuget'] as const;

/** The same politeness the download collector uses, for the same registries. */
export const DELAY_MS = 1200;

/**
 * One page of NuGet's registration index.
 *
 * `items` is present while a package is small and absent once it is not, in
 * which case `@id` addresses the page and it has to be fetched separately. Both
 * shapes are the documented one; a reader that only handles the first silently
 * loses every package with a long history, which is most of the ones worth
 * watching.
 */
interface RegistrationPage {
  '@id'?: string;
  lower?: string;
  upper?: string;
  items?: { catalogEntry?: { version?: string; published?: string; deprecation?: unknown } }[];
}

/**
 * Compare two versions well enough to pick which page holds one.
 *
 * Numeric parts only. A prerelease tag is dropped rather than ordered, because
 * the question here is which of ten disjoint ranges a version falls in, not
 * whether `4.4.1-dev` precedes `4.4.1` — and treating them as equal keeps a
 * version inside the page whose boundary carries the tag.
 */
function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    (v.split('-')[0] ?? '').split('.').map((part) => Number.parseInt(part, 10) || 0);

  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] ?? 0) - (right[i] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/** The page whose `[lower, upper]` range covers this version, latest first. */
export function pageHolding(
  pages: readonly RegistrationPage[],
  version: string,
): RegistrationPage | null {
  for (const page of [...pages].reverse()) {
    if (page.lower === undefined || page.upper === undefined) continue;
    if (compareVersions(version, page.lower) >= 0 && compareVersions(version, page.upper) <= 0) {
      return page;
    }
  }
  // No range matched — a package whose newest version is a prerelease past the
  // last boundary. The last page is where it would be.
  return pages.at(-1) ?? null;
}

/**
 * Everything one registry document says, read once.
 *
 * The date was the only field taken for weeks. The other four were in the same
 * response and were being discarded: whether the publisher has withdrawn it,
 * what it runs on the installing machine, how big it is, and where its
 * maintainers ask to be paid. None of them costs a request.
 */
export interface PackageReading {
  at: string;
  version: string;
  /** npm's `deprecated`, PyPI's and crates.io's `yanked`. Their words. */
  withdrawn: string | null;
  /** `preinstall`, `install`, `postinstall`, where the registry publishes them. */
  installScripts: string | null;
  bytes: number | null;
  funding: string | null;
}

export interface StalenessClient {
  /** Everything the registry publishes about it, or null when the read failed. */
  lastPublish(registry: string, name: string): Promise<PackageReading | null>;
  requests(): number;
}

/** Their text, not ours, and bounded — a deprecation notice can be an essay. */
const MAX_NOTICE = 200;

function notice(value: unknown): string | null {
  if (value === true) return 'withdrawn by the publisher';
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, MAX_NOTICE);
}

/**
 * The scripts npm will run on the installing machine, named in the order it
 * runs them. Anything else in `scripts` is a thing the maintainers run.
 */
const INSTALL_HOOKS = ['preinstall', 'install', 'postinstall'] as const;

function installScripts(scripts: unknown): string | null {
  if (scripts === null || typeof scripts !== 'object') return null;
  const named = scripts as Record<string, unknown>;
  const found = INSTALL_HOOKS.filter((hook) => typeof named[hook] === 'string');
  return found.length === 0 ? null : found.join(', ');
}

/** npm publishes `funding` as an object, an array of them, or a bare URL. */
function fundingUrl(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, MAX_NOTICE);
  if (Array.isArray(value)) return fundingUrl(value[0]);
  if (value !== null && typeof value === 'object') {
    const url = (value as { url?: unknown }).url;
    return typeof url === 'string' ? url.slice(0, MAX_NOTICE) : null;
  }
  return null;
}

/**
 * PyPI has no funding field. It has `project_urls`, where the convention is a
 * key called Funding or Sponsor — a convention, so it is matched loosely and
 * absent whenever the project did not follow it.
 */
function pypiFunding(urls: unknown): string | null {
  if (urls === null || typeof urls !== 'object') return null;
  for (const [label, url] of Object.entries(urls as Record<string, unknown>)) {
    if (/fund|sponsor|donate/i.test(label) && typeof url === 'string') return url.slice(0, MAX_NOTICE);
  }
  return null;
}

function size(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

async function json(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json' } });
  // 429 is a rate limit, not an answer. Told apart from a genuine 404 so a
  // throttled read never gets recorded as a package that stopped existing.
  if (response.status === 429) throw new ThrottledError(url, 429);
  if (!response.ok) return null;
  return response.json();
}

export function createStalenessClient(): StalenessClient {
  let spent = 0;

  return {
    requests: () => spent,

    async lastPublish(registry, name) {
      spent += 1;

      if (registry === 'npm') {
        const body = (await json(`https://registry.npmjs.org/${encodeURIComponent(name)}`)) as {
          time?: Record<string, string>;
          'dist-tags'?: { latest?: string };
          funding?: unknown;
          versions?: Record<
            string,
            {
              deprecated?: unknown;
              scripts?: unknown;
              funding?: unknown;
              dist?: { unpackedSize?: unknown };
            }
          >;
        } | null;
        const version = body?.['dist-tags']?.latest;
        const at = version === undefined ? undefined : body?.time?.[version];
        if (at === undefined || version === undefined) return null;

        const published = body?.versions?.[version];
        return {
          at,
          version,
          withdrawn: notice(published?.deprecated),
          installScripts: installScripts(published?.scripts),
          bytes: size(published?.dist?.unpackedSize),
          funding: fundingUrl(published?.funding ?? body?.funding),
        };
      }

      if (registry === 'pypi') {
        const body = (await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`)) as {
          info?: {
            version?: string;
            yanked?: unknown;
            yanked_reason?: unknown;
            project_urls?: unknown;
          };
          releases?: Record<string, { upload_time_iso_8601?: string }[]>;
          urls?: { size?: unknown; packagetype?: unknown }[];
        } | null;
        const version = body?.info?.version;
        const at = version === undefined ? undefined : body?.releases?.[version]?.[0]?.upload_time_iso_8601;
        if (at === undefined || version === undefined) return null;

        // The wheel where there is one: it is what almost everybody installs,
        // and a source distribution of the same release is a different number.
        const artefacts = body?.urls ?? [];
        const wheel = artefacts.find((file) => file.packagetype === 'bdist_wheel') ?? artefacts[0];

        return {
          at,
          version,
          withdrawn:
            body?.info?.yanked === true
              ? (notice(body.info.yanked_reason) ?? 'yanked by the publisher')
              : null,
          // PyPI publishes no install-hook field. Absent, not empty.
          installScripts: null,
          bytes: size(wheel?.size),
          funding: pypiFunding(body?.info?.project_urls),
        };
      }

      if (registry === 'gem') {
        const body = (await json(
          `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`,
        )) as {
          version?: string;
          version_created_at?: string;
          yanked?: unknown;
          funding_uri?: unknown;
          gem_uri?: unknown;
        } | null;
        const version = body?.version;
        const at = body?.version_created_at;
        if (at === undefined || version === undefined) return null;

        return {
          at,
          version,
          withdrawn: body?.yanked === true ? 'yanked by the publisher' : null,
          // RubyGems runs extension builds on install, but publishes no field
          // saying which gems do. Absent, not empty.
          installScripts: null,
          bytes: null,
          funding: typeof body?.funding_uri === 'string' ? body.funding_uri : null,
        };
      }

      if (registry === 'packagist') {
        // `vendor/package`, and the slash belongs in the path as a slash.
        const body = (await json(`https://packagist.org/packages/${name}.json`)) as {
          package?: {
            abandoned?: unknown;
            versions?: Record<string, { time?: string; version?: string }>;
          };
        } | null;
        const versions = body?.package?.versions ?? {};
        // Packagist lists branches alongside releases; a branch is not a
        // published version and dating the package by one would be wrong.
        const released = Object.values(versions)
          .filter((entry) => typeof entry.version === 'string' && !/^dev-|-dev$/.test(entry.version))
          .sort((a, b) => ((a.time ?? '') < (b.time ?? '') ? 1 : -1));
        const newest = released[0];
        if (newest?.time === undefined || newest.version === undefined) return null;

        // `abandoned` is `true`, or the name of the package to move to.
        const abandoned = body?.package?.abandoned;
        return {
          at: newest.time,
          version: newest.version,
          withdrawn:
            abandoned === true
              ? 'marked abandoned by the publisher'
              : typeof abandoned === 'string' && abandoned !== ''
                ? `marked abandoned by the publisher, replaced by ${abandoned}`
                : null,
          installScripts: null,
          bytes: null,
          funding: null,
        };
      }

      if (registry === 'nuget') {
        const body = (await json(
          `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(name.toLowerCase())}&take=1`,
        )) as { data?: { version?: string; deprecation?: unknown; published?: string }[] } | null;
        const found = body?.data?.[0];
        if (found?.version === undefined) return null;

        // The search index carries no publish date, so the version is dated by
        // the registration index below rather than guessed at.
        const registration = (await json(
          `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(name.toLowerCase())}/index.json`,
        )) as { items?: RegistrationPage[] } | null;

        const pages = registration?.items ?? [];
        let entries = pages.flatMap((page) => page.items ?? []);
        let match = entries.find((entry) => entry.catalogEntry?.version === found.version);

        // NuGet inlines the version list only while a package is small. Past
        // roughly a hundred versions the index becomes ten pages of `@id` and
        // nothing else, and the page has to be fetched on its own — which is
        // why Serilog, AutoMapper and Entity Framework Core all came back with
        // "no published version found" while three smaller packages worked.
        if (match === undefined) {
          const page = pageHolding(pages, found.version);
          if (page?.['@id'] !== undefined) {
            const body = (await json(page['@id'])) as RegistrationPage | null;
            entries = body?.items ?? [];
            match = entries.find((entry) => entry.catalogEntry?.version === found.version);
          }
        }

        const at = match?.catalogEntry?.published;
        if (at === undefined) return null;

        return {
          at,
          version: found.version,
          withdrawn: match?.catalogEntry?.deprecation ? 'deprecated by the publisher' : null,
          installScripts: null,
          bytes: null,
          funding: null,
        };
      }

      if (registry === 'crates') {
        const body = (await json(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`)) as {
          crate?: { updated_at?: string; max_version?: string };
          versions?: { num?: unknown; yanked?: unknown; yank_message?: unknown; crate_size?: unknown }[];
        } | null;
        const at = body?.crate?.updated_at;
        const version = body?.crate?.max_version;
        if (at === undefined || version === undefined) return null;

        // Matched by number rather than taken as the first entry: the newest
        // version and the highest version are not always the same row.
        const published = (body?.versions ?? []).find((row) => row.num === version);

        return {
          at,
          version,
          withdrawn:
            published?.yanked === true
              ? (notice(published.yank_message) ?? 'yanked by the publisher')
              : null,
          installScripts: null,
          bytes: size(published?.crate_size),
          funding: null,
        };
      }

      return null;
    },
  };
}

export function daysSince(iso: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(iso)) / 86_400_000);
}

export interface StalenessCollectionResult {
  rows: StalenessRow[];
  events: EventRecord[];
  errors: string[];
  requests: number;
}

/**
 * How long a package has to have been quiet for a release to be worth saying.
 *
 * A year. The pattern is the one behind event-stream and every supply-chain
 * incident shaped like it: a package nobody has touched in years publishes,
 * and everything that depends on it takes the update without anybody looking.
 * Nothing here says a wake is suspicious, because it usually is not — a
 * maintainer returning to a finished library looks identical.
 */
export const DORMANT_DAYS = 365;

export interface StalenessCollectionOptions {
  now: string;
  /** `YYYY-MM-DD` UTC, for event ids. */
  today: string;
  client?: StalenessClient;
  delayMs?: number;
  /** Registries to read. Defaults to `REGISTRIES`. */
  registries?: readonly string[];
  /** Event ids already recorded, so a rerun reports nothing twice. */
  seen?: ReadonlySet<string>;
  dormantDays?: number;
}

export async function collectStaleness(
  packages: readonly AdoptionRow[],
  previous: readonly StalenessRow[],
  options: StalenessCollectionOptions,
): Promise<StalenessCollectionResult> {
  const client = options.client ?? createStalenessClient();
  const registries = new Set(options.registries ?? REGISTRIES);
  const recorded = options.seen ?? new Set<string>();
  const dormantDays = options.dormantDays ?? DORMANT_DAYS;
  const errors: string[] = [];
  const rows: StalenessRow[] = [];
  const events: EventRecord[] = [];

  const before = new Map(previous.map((row) => [`${row.registry} ${row.name}`, row]));
  const wanted = packages.filter((row) => registries.has(row.registry));

  // One row per registry and name. A package published from two watched
  // repositories is one package, and reading it twice would spend a request to
  // learn the same date.
  const seen = new Set<string>();

  for (const [index, entry] of wanted.entries()) {
    const key = `${entry.registry} ${entry.name}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (index > 0) await sleep(options.delayMs ?? DELAY_MS);

    const held = before.get(key);

    let reading: PackageReading | null;
    try {
      reading = await client.lastPublish(entry.registry, entry.name);
    } catch (error) {
      // Throttling and outages both land here, and neither is news about a
      // package. The last known date is carried forward untouched.
      errors.push(
        `staleness ${key}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (held !== undefined) rows.push(held);
      continue;
    }

    if (reading === null) {
      // A registry that answers but has nothing for this name. Kept at its last
      // known date rather than recorded as never published — an unreadable read
      // and a package with no releases are different facts.
      if (held !== undefined) rows.push(held);
      else errors.push(`staleness ${key}: no published version found`);
      continue;
    }

    const lastPublish = reading.at.slice(0, 10);

    rows.push({
      registry: entry.registry,
      name: entry.name,
      repo: entry.id,
      lastPublish,
      version: reading.version,
      withdrawn: reading.withdrawn,
      installScripts: reading.installScripts,
      bytes: reading.bytes,
      funding: reading.funding,
      observedAt: options.now,
    });

    // A package the publisher has told people not to install. Stated as the
    // standing fact it is rather than as a transition: the field is read for
    // the first time on some run, and "npm marks this deprecated" is true
    // whenever that run happens, where "was deprecated today" would not be.
    //
    // Only against a row that was read before. A first reading is a starting
    // point, not a change — the mistake that published 341 licence findings,
    // every one of them this project learning something rather than something
    // happening. `scripts/backfill-packages.ts` fills the field for every row
    // already on file so the first scheduled run has something to compare
    // against; a row whose read fails during that backfill can still produce a
    // late finding, and the sentence is state-shaped precisely so that a late
    // one is still true.
    if (reading.withdrawn !== null && held !== undefined && held.withdrawn == null) {
      const id = `withdrawn:${entry.registry}:${entry.name}:${options.today}`;
      if (!recorded.has(id)) {
        events.push({
          id,
          kind: 'package-withdrawn',
          repo: entry.id,
          detectedAt: options.now,
          // A field either says this or it does not. There is no second
          // observation that could make it more true.
          confidence: 'confirmed',
          summaryState: 'skipped',
          summary: null,
          summarySource: null,
          evidenceUrl: registryPage(entry.registry, entry.name),
          metrics: {
            registry: entry.registry,
            package: entry.name,
            version: reading.version,
            notice: reading.withdrawn,
          },
          supersedes: null,
        });
      }
    }

    // A dormant package that published. The event-stream shape, and also what a
    // maintainer coming back to a finished library looks like — the record says
    // how long the gap was and stops there.
    const was = held?.lastPublish ?? null;
    const gap =
      was === null || was >= lastPublish ? null : daysSince(`${was}T00:00:00Z`, lastPublish);

    if (gap !== null && gap >= dormantDays) {
      const id = `woke:${entry.registry}:${entry.name}:${lastPublish}`;
      if (!recorded.has(id)) {
        events.push({
          id,
          kind: 'package-woke',
          repo: entry.id,
          detectedAt: options.now,
          confidence: 'confirmed',
          summaryState: 'skipped',
          summary: null,
          summarySource: null,
          evidenceUrl: registryPage(entry.registry, entry.name),
          metrics: {
            registry: entry.registry,
            package: entry.name,
            version: reading.version,
            quietDays: gap,
            previousPublish: was,
            publishedAt: lastPublish,
          },
          supersedes: null,
        });
      }
    }
  }

  return { rows, events, errors, requests: client.requests() };
}

/** Where the registry itself says it, for the evidence link on every event. */
function registryPage(registry: string, name: string): string {
  if (registry === 'npm') return `https://www.npmjs.com/package/${name}`;
  if (registry === 'pypi') return `https://pypi.org/project/${name}/`;
  return `https://crates.io/crates/${name}`;
}
