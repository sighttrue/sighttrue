/**
 * The facts a reviewer would be annoyed to discover after installing.
 *
 * The same list, in the same order, as `noticesFor` in `src/lib/verdict.ts`,
 * which is what `/api/verdict` and the `check_before_install` MCP tool return.
 * Two implementations because this one has to run on a stranger's Node with no
 * build step; `tests/parsers.test.ts` asserts they produce the same notices for
 * the same reading rather than leaving it to hope.
 *
 * Ordered by how much somebody would want to know it, which is not severity —
 * nothing here is scored. The withdrawal is first because it is an instruction
 * rather than a measurement, and it belongs to the publisher, not to us.
 */

const SOURCE_AVAILABLE = /BUSL|SSPL|Elastic|RSAL|Commons-Clause|PolyForm/i;
const LONG_UNPUBLISHED_DAYS = 730;

/**
 * How OSV spells each ecosystem, which is not how the registries spell
 * themselves. A query with the wrong one comes back empty rather than failing,
 * so a mistake here reads as "no advisories" — the worst available way to be
 * wrong about a package.
 */
const OSV_ECOSYSTEM = {
  npm: 'npm',
  pypi: 'PyPI',
  crates: 'crates.io',
  gem: 'RubyGems',
  packagist: 'Packagist',
  nuget: 'NuGet',
  maven: 'Maven',
};

/**
 * Each registry's own page for a package.
 *
 * Named one by one, with no fallback. This used to end in a bare `return` for
 * crates.io, so the day RubyGems opened, `gem:rails` would have printed a link
 * to a crates.io page that has never existed — in somebody's build log, under
 * this project's name.
 */
const PAGE = {
  // npm keeps a leading `@` literal in the address of every scoped package.
  npm: (n) => `https://www.npmjs.com/package/${slashes(n)}`,
  pypi: (n) => `https://pypi.org/project/${encodeURIComponent(n)}/`,
  crates: (n) => `https://crates.io/crates/${encodeURIComponent(n)}`,
  gem: (n) => `https://rubygems.org/gems/${encodeURIComponent(n)}`,
  // Always `vendor/package`, and the slash between them is part of the path.
  packagist: (n) => `https://packagist.org/packages/${slashes(n)}`,
  nuget: (n) => `https://www.nuget.org/packages/${encodeURIComponent(n)}`,
  // Maven names are `group:artifact`, and its page splits them on the colon —
  // which has to happen before encoding, or the separator arrives as `%3A` and
  // the split finds nothing.
  maven: (n) => `https://central.sonatype.com/artifact/${n.split(':').map(encodeURIComponent).join('/')}`,
};

/** Encode each path segment, leaving the separators as separators. */
function slashes(name) {
  return name
    .split('/')
    .map((part) => (part.startsWith('@') ? `@${encodeURIComponent(part.slice(1))}` : encodeURIComponent(part)))
    .join('/');
}

export function registryUrl(registry, name) {
  const page = PAGE[registry];
  return page ? page(name) : '';
}

export function advisoryUrl(registry, name) {
  const ecosystem = OSV_ECOSYSTEM[registry];
  if (!ecosystem) return '';
  return `https://osv.dev/list?ecosystem=${encodeURIComponent(ecosystem)}&q=${encodeURIComponent(name)}`;
}

function daysSince(iso, today) {
  if (!iso) return null;
  const at = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(at)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - at) / 86_400_000);
}

export function noticesFor(registry, name, entry, today) {
  const found = [];
  const registryPage = registryUrl(registry, name);
  const repository = `https://github.com/${entry.repo}`;

  if (entry.withdrawn) {
    found.push({
      kind: 'withdrawn',
      statement: `The publisher has withdrawn this package: ${entry.withdrawn}`,
      source: registryPage,
    });
  }

  if (entry.archived) {
    found.push({
      kind: 'repository-archived',
      statement: `The repository that publishes it, ${entry.repo}, is archived and read-only. Published versions keep working; nothing new is coming.`,
      source: repository,
    });
  }

  if (entry.installScripts) {
    found.push({
      kind: 'runs-on-install',
      statement: `It runs ${entry.installScripts} on the machine that installs it. Most such scripts fetch a platform binary; this does not read what they contain.`,
      source: registryPage,
    });
  }

  if (entry.license && SOURCE_AVAILABLE.test(entry.license)) {
    found.push({
      kind: 'source-available-licence',
      statement: `Its licence is ${entry.license}, which is source-available rather than open source. That is a licensing fact, not a quality one.`,
      source: repository,
    });
  }

  if (typeof entry.advisories === 'number' && entry.advisories > 0) {
    found.push({
      kind: 'advisories',
      statement: `${entry.advisories} ${entry.advisories === 1 ? 'advisory has' : 'advisories have'} been filed against it, all time and all versions — not against the version you are installing.`,
      source: advisoryUrl(registry, name),
    });
  }

  const quiet = daysSince(entry.lastPublish, today);
  if (quiet !== null && quiet >= LONG_UNPUBLISHED_DAYS && entry.lastPublish) {
    found.push({
      kind: 'long-unpublished',
      statement: `Its newest published version is from ${entry.lastPublish}, ${quiet} days ago. A finished library is finished, so this is a question rather than a fault.`,
      source: registryPage,
    });
  }

  return found;
}
