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
}

function lower(name: string): string {
  return name.trim().toLowerCase();
}

/** PEP 503: case-folded, and any run of `.`, `-` or `_` becomes one `-`. */
function pep503(name: string): string {
  return lower(name).replace(/[-_.]+/g, '-');
}

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
  },
  {
    id: 'pypi',
    label: 'PyPI',
    osv: 'PyPI',
    purl: 'pypi',
    page: (name) => `https://pypi.org/project/${encode(name)}/`,
    fold: pep503,
    manifests: ['requirements.txt', 'pyproject.toml'],
  },
  {
    id: 'crates',
    label: 'crates.io',
    osv: 'crates.io',
    purl: 'cargo',
    page: (name) => `https://crates.io/crates/${encode(name)}`,
    fold: lower,
    manifests: ['Cargo.toml'],
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
  },
  {
    id: 'nuget',
    label: 'NuGet',
    osv: 'NuGet',
    purl: 'nuget',
    page: (name) => `https://www.nuget.org/packages/${encode(name)}`,
    fold: lower,
    manifests: ['packages.config'],
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

/** The manifest filename to registry, for readers that start from a path. */
export function registryForManifest(filename: string): string | null {
  for (const facts of REGISTRY_TABLE) {
    if (facts.manifests.includes(filename)) return facts.id;
  }
  return null;
}
