/**
 * Everything that differs between one package registry and the next, in one
 * place.
 *
 * Adding Ruby meant touching nineteen files, because each fact about a registry
 * — how OSV spells it, how a purl names it, where its package page lives, how
 * it folds a name, which file declares its dependencies — was written out
 * wherever it happened to be needed. Four more registries would have meant
 * doing that four more times, and the fifth copy is where they start
 * disagreeing. This project has already had three manifest readers disagree
 * badly enough to report a crate that did not exist.
 *
 * So each registry is described once here and every caller reads from it.
 * Adding the sixth should be one entry.
 */

export interface RegistryFacts {
  /** Prefix used in `registry:name` throughout the ledger. */
  id: string;
  /** What a person calls it. */
  label: string;
  /** How OSV spells this ecosystem, or null where OSV does not cover it. */
  osv: string | null;
  /** The `pkg:` type in a purl, per the package-url spec. */
  purl: string | null;
  /** Builds the package's page on the registry itself. */
  page: (name: string) => string;
  /**
   * How the registry folds two spellings into one package.
   *
   * PyPI treats `PyYAML` and `pyyaml` as one and collapses any run of dot, dash
   * or underscore to a single dash. Packagist is `vendor/package`, lowercased.
   * crates.io folds case but keeps the separator. Getting this wrong stores the
   * same package twice under two names.
   */
  fold: (name: string) => string;
  /** Files that declare dependencies for this ecosystem. */
  manifests: readonly string[];
  /**
   * What a name may look like here, after folding.
   *
   * Shape only — the checks that stop a name becoming a path live with the
   * caller, because they are the same everywhere and are not a fact about the
   * registry. These genuinely differ: npm allows one `@scope/`, Packagist
   * *requires* `vendor/package`, and Maven is `group:artifact`. One shared
   * pattern was in force when four registries were opened, so `/stack` offered
   * Packagist and Maven in its selector and then refused every real name in
   * either of them.
   */
  namePattern: RegExp;
  /**
   * Whether a package here gets a page on this site.
   *
   * False for Maven only, and for one reason: its names are `group:artifact`,
   * which is not a legal filename on Windows and not a URL segment anywhere.
   * `src/build.ts` publishes no page, so anything that hands out a package URL
   * — `/api/verdict`, the MCP server — has to know that, or it answers with an
   * address that has never existed inside a response whose whole point is that
   * every figure can be followed to its source.
   */
  paged: boolean;
}

function lower(name: string): string {
  return name.trim().toLowerCase();
}

/** PEP 503: case-folded, and any run of `.`, `-` or `_` becomes one `-`. */
function pep503(name: string): string {
  return lower(name).replace(/[-_.]+/g, '-');
}

/** One unscoped segment: starts alphanumeric, then word characters and dots. */
const SEGMENT = '[a-z0-9][a-z0-9._-]*';

const NAME_SHAPE = {
  /** npm allows a single `@scope/` and nothing else with a slash in it. */
  npm: new RegExp(`^(@${SEGMENT}/)?${SEGMENT}$`),
  plain: new RegExp(`^${SEGMENT}$`),
  /** Packagist requires `vendor/package` — one slash, never zero, never two. */
  packagist: new RegExp(`^${SEGMENT}/${SEGMENT}$`),
  /** Maven is `group:artifact`, the group dotted. */
  maven: new RegExp(`^${SEGMENT}:${SEGMENT}$`),
} as const;

const encode = (name: string): string =>
  name
    .split('/')
    .map((part) => (part.startsWith('@') ? `@${encodeURIComponent(part.slice(1))}` : encodeURIComponent(part)))
    .join('/');

export const REGISTRY_TABLE: readonly RegistryFacts[] = [
  {
    id: 'npm',
    label: 'npm',
    osv: 'npm',
    purl: 'npm',
    page: (name) => `https://www.npmjs.com/package/${encode(name)}`,
    fold: lower,
    manifests: ['package.json'],
    namePattern: NAME_SHAPE.npm,
    paged: true,
  },
  {
    id: 'pypi',
    label: 'PyPI',
    osv: 'PyPI',
    purl: 'pypi',
    page: (name) => `https://pypi.org/project/${encode(name)}/`,
    fold: pep503,
    manifests: ['requirements.txt', 'pyproject.toml'],
    namePattern: NAME_SHAPE.plain,
    paged: true,
  },
  {
    id: 'crates',
    label: 'crates.io',
    osv: 'crates.io',
    purl: 'cargo',
    page: (name) => `https://crates.io/crates/${encode(name)}`,
    fold: lower,
    manifests: ['Cargo.toml'],
    namePattern: NAME_SHAPE.plain,
    paged: true,
  },
  {
    id: 'gem',
    label: 'RubyGems',
    osv: 'RubyGems',
    purl: 'gem',
    page: (name) => `https://rubygems.org/gems/${encode(name)}`,
    // Gem names are case-sensitive in principle and lowercase in practice.
    fold: lower,
    manifests: ['Gemfile', 'gems.rb'],
    namePattern: NAME_SHAPE.plain,
    paged: true,
  },
  {
    id: 'packagist',
    label: 'Packagist',
    osv: 'Packagist',
    purl: 'composer',
    page: (name) => `https://packagist.org/packages/${encode(name)}`,
    // Always `vendor/package`, and Packagist treats it case-insensitively.
    fold: lower,
    manifests: ['composer.json'],
    namePattern: NAME_SHAPE.packagist,
    paged: true,
  },
  {
    id: 'nuget',
    label: 'NuGet',
    osv: 'NuGet',
    purl: 'nuget',
    page: (name) => `https://www.nuget.org/packages/${encode(name)}`,
    fold: lower,
    manifests: ['packages.config'],
    namePattern: NAME_SHAPE.plain,
    paged: true,
  },
  {
    id: 'maven',
    label: 'Maven Central',
    osv: 'Maven',
    purl: 'maven',
    // Maven names are `group:artifact`, and its page splits them on the colon —
    // which has to happen before encoding, or the separator arrives as `%3A`
    // and there is nothing left to split on.
    page: (name) => `https://central.sonatype.com/artifact/${name.split(':').map(encodeURIComponent).join('/')}`,
    fold: lower,
    manifests: ['pom.xml'],
    namePattern: NAME_SHAPE.maven,
    // The only false in the table. See the field's own note.
    paged: false,
  },
  {
    id: 'brew',
    label: 'Homebrew',
    // Homebrew is a package manager over other people's software, so neither
    // OSV nor purl treats it as an ecosystem of its own.
    osv: null,
    purl: null,
    page: (name) => `https://formulae.brew.sh/formula/${encode(name)}`,
    fold: lower,
    manifests: [],
    namePattern: NAME_SHAPE.plain,
    // Never reached: Homebrew is not watchable, so no package is stored under
    // it. True rather than false so this reads as "nothing special here".
    paged: true,
  },
];

const BY_ID = new Map(REGISTRY_TABLE.map((facts) => [facts.id, facts]));

export function registryFacts(id: string): RegistryFacts | null {
  return BY_ID.get(id) ?? null;
}

/** Every registry a package may be recorded under. */
export const REGISTRY_IDS: readonly string[] = REGISTRY_TABLE.map((facts) => facts.id);

/**
 * The registries a visitor may put on a watchlist.
 *
 * Homebrew is absent on purpose: it reports an install count but no publish
 * date and no withdrawal notice, so an entry for it could never produce most of
 * what this project reads.
 */
export const WATCHABLE_IDS: readonly string[] = REGISTRY_TABLE.filter(
  (facts) => facts.id !== 'brew',
).map((facts) => facts.id);

/** Fold a name the way its own registry does. Unknown registries fold to lower. */
export function foldFor(registry: string, name: string): string {
  return (registryFacts(registry)?.fold ?? lower)(name);
}

/** Registries whose packages have a page here. Everything that hands out a URL. */
export const PAGED_IDS: readonly string[] = REGISTRY_TABLE.filter((facts) => facts.paged).map(
  (facts) => facts.id,
);

/** The manifest filename to registry, for readers that start from a path. */
export function registryForManifest(filename: string): string | null {
  for (const facts of REGISTRY_TABLE) {
    if (facts.manifests.includes(filename)) return facts.id;
  }
  return null;
}
