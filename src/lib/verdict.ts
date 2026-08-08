/**
 * Every reading this project holds about one package, in one answer, each with
 * the address of the body that published it.
 *
 * Written for agents. An agent deciding whether to accept a dependency asks
 * five separate questions — advisories, licence, when it last shipped, who
 * writes it, whether the runtime it needs is still supported — and today that
 * is five calls against four services, so in practice it asks none of them and
 * answers from training data instead.
 *
 * The shape is the argument. Nothing here is scored, ranked or totalled: there
 * is no overall number, because an overall number would be this project's
 * judgement of somebody else's work wearing the costume of a measurement. What
 * there is instead is a `source` on every single reading. An agent that quotes
 * one of these into a code review can cite it, and the person reading that
 * review can check it in one click. That is the whole design.
 *
 * Pure. The endpoint fetches the bundles and calls in here.
 */

import { foldName } from './watchlist-api.ts';

export type VerdictRegistry = 'npm' | 'pypi' | 'crates';

const REGISTRIES: readonly string[] = ['npm', 'pypi', 'crates'];

/** Longest name any of the three registries permits, plus scope and slash. */
const MAX_NAME = 214;

export interface PackageId {
  registry: VerdictRegistry;
  name: string;
}

/**
 * `registry:name`, refused rather than repaired when it is anything else.
 *
 * The name is echoed back in the response and used to build URLs, so it is
 * length-limited and checked for the two shapes that turn a name into a path
 * somewhere else: `..` and a leading slash.
 */
export function parsePkg(raw: string | null): PackageId | null {
  if (raw === null) return null;

  const separator = raw.indexOf(':');
  if (separator < 1) return null;

  const registry = raw.slice(0, separator).toLowerCase();
  const name = raw.slice(separator + 1).trim();
  if (!REGISTRIES.includes(registry)) return null;
  if (name === '' || name.length > MAX_NAME) return null;
  if (name.includes('..') || name.startsWith('.') || name.startsWith('/')) return null;

  return { registry: registry as VerdictRegistry, name };
}

/**
 * The index entry for a package, however the caller spelled it.
 *
 * Exact match first, then folded — `PyYAML` and `pyyaml` are one package on
 * PyPI, as are `ruamel.yaml` and `ruamel-yaml`, and an agent reading somebody's
 * requirements.txt sends whichever spelling the file contains. Returns the key
 * it matched on, because that spelling is also the address of the package's
 * page.
 */
export function findEntry(
  packages: Record<string, VerdictEntry>,
  id: PackageId,
): { key: string; entry: VerdictEntry } | null {
  const exact = packages[`${id.registry}:${id.name}`];
  if (exact !== undefined) return { key: `${id.registry}:${id.name}`, entry: exact };

  const wanted = foldName(id.registry, id.name);
  for (const [key, entry] of Object.entries(packages)) {
    const cut = key.indexOf(':');
    if (key.slice(0, cut) !== id.registry) continue;
    if (foldName(id.registry, key.slice(cut + 1)) === wanted) return { key, entry };
  }

  return null;
}

/** How the registries and OSV each spell the same three ecosystems. */
const OSV_ECOSYSTEM: Record<VerdictRegistry, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  crates: 'crates.io',
};

export function registryUrl(registry: VerdictRegistry, name: string): string {
  // Each segment encoded, except a leading `@`, which npm keeps literal in the
  // address it publishes for every scoped package.
  const encoded = name
    .split('/')
    .map((part) =>
      part.startsWith('@') ? `@${encodeURIComponent(part.slice(1))}` : encodeURIComponent(part),
    )
    .join('/');
  if (registry === 'npm') return `https://www.npmjs.com/package/${encoded}`;
  if (registry === 'pypi') return `https://pypi.org/project/${encoded}/`;
  return `https://crates.io/crates/${encoded}`;
}

export function advisoryUrl(registry: VerdictRegistry, name: string): string {
  return `https://osv.dev/list?ecosystem=${encodeURIComponent(OSV_ECOSYSTEM[registry])}&q=${encodeURIComponent(name)}`;
}

export function scorecardUrl(repo: string): string {
  return `https://deps.dev/project/github/${encodeURIComponent(repo)}`;
}

export interface VerdictEntry {
  repo: string;
  installs: number | null;
  scorecard: number | null;
  scoredAt: string | null;
  advisories: number | null;
  license: string | null;
  archived: boolean;
  pushedAt: string | null;
  lastPublish: string | null;
  version: string | null;
  withdrawn: string | null;
  installScripts: string | null;
  bytes: number | null;
  funding: string | null;
  busFactor: number | null;
  topShare: number | null;
}

export interface EolProduct {
  product: string;
  cycle: string;
  eol: string | null;
  ended: boolean | null;
  latest: string | null;
  lts: boolean | null;
}

/** A licence that is not open source however much its name suggests otherwise. */
const SOURCE_AVAILABLE = /BUSL|SSPL|Elastic|RSAL|Commons-Clause|PolyForm/i;

/**
 * The support cycle a version belongs to, or the whole product's standing.
 *
 * Matching is by prefix and the longest match wins, because `1.2` and `1` can
 * both be cycles of the same product and only one of them is the answer for
 * `1.2.3`. Without a version there is no cycle to pick and the endpoint returns
 * the product's cycles rather than choosing one — guessing which release
 * somebody is on is the one way this reading becomes actively misleading.
 */
export function cycleFor(
  cycles: readonly EolProduct[],
  version: string | null,
): EolProduct | null {
  if (version === null || version === '') return null;

  const clean = version.replace(/^[\^~>=<\s v]+/, '');
  let best: EolProduct | null = null;

  for (const cycle of cycles) {
    if (clean === cycle.cycle || clean.startsWith(`${cycle.cycle}.`)) {
      if (best === null || cycle.cycle.length > best.cycle.length) best = cycle;
    }
  }

  return best;
}

export interface Reading<T> {
  value: T;
  /** Where a reader checks this without trusting this project. */
  source: string;
  /** What the value does and does not support. Always present. */
  note: string;
}

export interface Verdict {
  pkg: string;
  covered: boolean;
  registry: VerdictRegistry;
  name: string;
  repository: string | null;
  /** This package's page here, for a caller that wants to show its working. */
  page: string | null;
  asOf: string | null;
  readings: Record<string, unknown>;
  limits: string[];
}

export const LIMITS = [
  'Every figure here is somebody else’s published measurement, republished with its source. Nothing is scored, ranked or combined, and there is no overall verdict — the readings are what a decision rests on, not a substitute for making one.',
  'The watchlist is curated and partial, around 400 repositories chosen by hand. A package that is not covered is not being judged; it is simply not tracked.',
  'Scorecards are the OpenSSF Scorecard published by Google Open Source Insights. They measure declared practices such as code review and workflow permissions, and a low score is not a statement that a project is unsafe.',
  'Advisory counts are OSV totals for all time and all versions, so a mature, well-patched project carries more than a young one. A high count is not a warning on its own.',
  'The bus factor is how many contributors account for half of all commits. One person doing the work is a fact about a project, not a fault in it.',
  'End-of-life dates are published by endoflife.date and republished unchanged. A package is matched to a product by name, and most packages match none.',
  'Readings are taken every four hours at best. Nothing here is live.',
];

export interface VerdictInput {
  id: PackageId;
  /** The index entry and the key it was found under, or null when untracked. */
  found: { key: string; entry: VerdictEntry } | null;
  /** Every cycle of the endoflife.date product whose name matches, if any. */
  cycles: readonly EolProduct[];
  /** The version the caller asked about, if they gave one. */
  version: string | null;
  /** When the agent last completed a run. */
  asOf: string | null;
  today: string;
}

function daysSince(iso: string | null, today: string): number | null {
  if (iso === null) return null;
  const at = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(at)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - at) / 86_400_000);
}

export function buildVerdict(input: VerdictInput): Verdict {
  const { id, found, cycles, version, asOf, today } = input;
  const pkg = `${id.registry}:${id.name}`;

  const endOfLife = eolReading(id, cycles, version);

  if (found === null) {
    return {
      pkg,
      covered: false,
      registry: id.registry,
      name: id.name,
      repository: null,
      page: null,
      asOf,
      readings: {
        // Not an empty object. An agent that gets `{}` back reports "no
        // advisories"; one that gets a stated absence reports what is true.
        note: 'Not on the watchlist, so nothing has been collected for it. This is not a judgement about the package.',
        ...(endOfLife === null ? {} : { endOfLife }),
      },
      limits: LIMITS,
    };
  }

  const { key, entry } = found;

  const readings: Record<string, unknown> = {
    advisories: {
      value: entry.advisories,
      source: advisoryUrl(id.registry, id.name),
      note:
        entry.advisories === null
          ? 'OSV could not be read for this package. Null is unread, not zero.'
          : 'OSV totals for all time and all versions, not for the version you are installing.',
    },
    licence: {
      value: entry.license,
      sourceAvailable: entry.license !== null && SOURCE_AVAILABLE.test(entry.license),
      source: `https://github.com/${entry.repo}`,
      note: 'As GitHub reports it for the publishing repository. A source-available licence is a licensing fact, not a quality one.',
    },
    published: {
      value: entry.lastPublish,
      version: entry.version,
      daysAgo: daysSince(entry.lastPublish, today),
      source: registryUrl(id.registry, id.name),
      note: 'The registry’s own date for the newest version. A package with no recent publish is not necessarily abandoned — a finished library is finished.',
    },
    // The publisher's own instruction not to install this. First thing an agent
    // should read and the one reading here that is an instruction rather than a
    // measurement — theirs, not this project's.
    withdrawn: {
      value: entry.withdrawn,
      source: registryUrl(id.registry, id.name),
      note:
        entry.withdrawn === null
          ? `${id.registry === 'npm' ? 'npm' : 'The registry'} does not mark this package withdrawn.`
          : 'The publisher’s own notice, republished unchanged. npm calls it deprecated, PyPI and crates.io call it yanked.',
    },
    installScripts: {
      value: entry.installScripts,
      source: registryUrl(id.registry, id.name),
      note:
        id.registry === 'npm'
          ? 'Scripts npm runs on the installing machine. Naming them is a fact about the package, not a claim that any of them is malicious — most are not.'
          : 'This registry publishes no install-hook field, so null here is unpublished rather than absent.',
    },
    installWeight: {
      value: entry.bytes,
      source: registryUrl(id.registry, id.name),
      note: 'Bytes the published artefact unpacks to, as the registry reports it. Not the size of its dependency tree.',
    },
    funding: {
      value: entry.funding,
      source: registryUrl(id.registry, id.name),
      note: 'Where the maintainers ask to be funded, as the registry lists it. Absent means they did not list one.',
    },
    busFactor: {
      value: entry.busFactor,
      topShare: entry.topShare,
      source: `https://github.com/${entry.repo}/graphs/contributors`,
      note: 'Contributors accounting for half of all commits, read from the commit history.',
    },
    scorecard: {
      value: entry.scorecard,
      scoredAt: entry.scoredAt,
      source: scorecardUrl(entry.repo),
      note: 'OpenSSF Scorecard from Google Open Source Insights. Declared practices, not safety.',
    },
    repository: {
      value: entry.repo,
      archived: entry.archived,
      pushedAt: entry.pushedAt,
      daysSincePush: daysSince(entry.pushedAt, today),
      source: `https://github.com/${entry.repo}`,
      note: 'The repository that publishes the package. Its dates are not the package’s dates.',
    },
    endOfLife,
  };

  return {
    pkg,
    covered: true,
    registry: id.registry,
    name: id.name,
    repository: entry.repo,
    page: `/${key.replace(':', '/')}`,
    asOf,
    readings,
    limits: LIMITS,
  };
}

/**
 * Whether the thing being installed has a published end of support.
 *
 * Most packages have none and the honest answer is a stated null rather than an
 * omitted key — an absent field reads to a caller as "no end-of-life", which is
 * a claim, and this has not checked anything to support it.
 */
function eolReading(
  id: PackageId,
  cycles: readonly EolProduct[],
  version: string | null,
): unknown {
  if (cycles.length === 0) {
    return {
      value: null,
      source: 'https://endoflife.date',
      note: `No endoflife.date product is named ${id.name}, so no support window is published for it here. That is not the same as being supported.`,
    };
  }

  const product = (cycles[0] as EolProduct).product;
  const matched = cycleFor(cycles, version);

  if (matched === null) {
    return {
      value: null,
      product,
      cycles: cycles.map((cycle) => ({ cycle: cycle.cycle, eol: cycle.eol, ended: cycle.ended })),
      source: `https://endoflife.date/${product}`,
      note:
        version === null
          ? 'Every published cycle, because no version was given. Which one applies depends on the version installed.'
          : `No published cycle covers ${version}.`,
    };
  }

  return {
    value: matched.eol,
    product,
    cycle: matched.cycle,
    ended: matched.ended,
    latest: matched.latest,
    lts: matched.lts,
    source: `https://endoflife.date/${product}`,
    note: 'Published by endoflife.date and republished unchanged. Nothing here is inferred.',
  };
}
