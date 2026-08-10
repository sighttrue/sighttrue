/**
 * Reading a registry directly, for packages the published index does not hold.
 *
 * The index is 186 packages. A real manifest holds dependencies drawn from
 * millions, and measured against the projects this watches, 3% of them had a
 * reading — more than half of those projects got nothing at all. A checker that
 * answers "nothing on record" to most of what it is shown is not a checker.
 *
 * The fix costs this project nothing, because the CLI runs on somebody else's
 * machine. Their computer asks npm; no server here is involved and no rate limit
 * here is spent. The page at /stack already does exactly this against OSV, so
 * the pattern is the site's own rather than a new one.
 *
 * The manifest still never leaves the machine. Package names go to the registry
 * that publishes them — which is where they came from — and nothing else moves.
 *
 * What this can read: the publisher's withdrawal notice, the real publish date,
 * install scripts, artefact size, funding link. What it cannot: bus factor,
 * scorecard, fork history. Those need a GitHub token, and asking a stranger for
 * one to run a dependency check would be a worse trade than the gap it closes.
 *
 * A reading taken here is **not** an archived reading. It is not in a file, it
 * did not pass the carry-forward rules, and nobody can check it tomorrow. The
 * caller must label it differently — see `live` on the returned object.
 */

const USER_AGENT = 'sighttrue-cli (+https://sighttrue.com)';

/** Registries answerable without a key. Homebrew and Maven publish no dates. */
export const READABLE = ['npm', 'pypi', 'crates', 'gem', 'packagist', 'nuget'];

/** Beyond this a manifest is a directory, and the registries are a courtesy. */
export const MAX_LOOKUPS = 60;

/** How many at once. Polite to services that owe this project nothing. */
const CONCURRENCY = 6;

async function json(url) {
  try {
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/** Their text, not ours, and bounded — a deprecation notice can be an essay. */
function notice(value) {
  if (value === true) return 'withdrawn by the publisher';
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text === '' ? null : text.slice(0, 200);
}

const HOOKS = ['preinstall', 'install', 'postinstall'];

async function npm(name) {
  const doc = await json(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
  const latest = doc?.['dist-tags']?.latest;
  if (typeof latest !== 'string') return null;

  const version = doc.versions?.[latest] ?? {};
  const scripts = Object.keys(version.scripts ?? {}).filter((key) => HOOKS.includes(key));

  return {
    version: latest,
    lastPublish: (doc.time?.[latest] ?? '').slice(0, 10) || null,
    withdrawn: notice(version.deprecated),
    installScripts: scripts.length > 0 ? scripts.join(', ') : null,
    bytes: typeof version.dist?.unpackedSize === 'number' ? version.dist.unpackedSize : null,
    funding: typeof version.funding?.url === 'string' ? version.funding.url : null,
  };
}

async function pypi(name) {
  const doc = await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
  const version = doc?.info?.version;
  if (typeof version !== 'string') return null;

  const files = doc.releases?.[version] ?? [];
  return {
    version,
    lastPublish: (files[0]?.upload_time ?? '').slice(0, 10) || null,
    withdrawn: doc.info.yanked ? notice(doc.info.yanked_reason) ?? 'yanked by the publisher' : null,
    // PyPI publishes no install-hook field, so null here is unpublished rather
    // than absent. Saying nothing is the honest reading.
    installScripts: null,
    bytes: typeof files[0]?.size === 'number' ? files[0].size : null,
    funding: null,
  };
}

async function crates(name) {
  const doc = await json(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`);
  const version = doc?.crate?.max_version;
  if (typeof version !== 'string') return null;

  // The newest version and the highest version are not always the same row.
  const published = (doc.versions ?? []).find((row) => row.num === version);
  return {
    version,
    lastPublish: (doc.crate.updated_at ?? '').slice(0, 10) || null,
    withdrawn: published?.yanked ? notice(published.yank_message) ?? 'yanked by the publisher' : null,
    installScripts: null,
    bytes: typeof published?.crate_size === 'number' ? published.crate_size : null,
    funding: null,
  };
}

async function gem(name) {
  const doc = await json(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`);
  if (typeof doc?.version !== 'string') return null;

  return {
    version: doc.version,
    lastPublish: (doc.version_created_at ?? '').slice(0, 10) || null,
    withdrawn: doc.yanked === true ? 'yanked by the publisher' : null,
    installScripts: null,
    bytes: null,
    funding: typeof doc.funding_uri === 'string' ? doc.funding_uri : null,
  };
}

async function packagist(name) {
  // `vendor/package`, and the slash belongs in the path as a slash.
  const doc = await json(`https://packagist.org/packages/${name}.json`);
  const versions = doc?.package?.versions ?? {};

  // Dev branches are not releases. Sorting them in would date the package by a
  // branch that moves every time somebody pushes.
  const releases = Object.values(versions).filter(
    (row) => typeof row?.version === 'string' && !/dev|master|main|trunk/i.test(row.version),
  );
  if (releases.length === 0) return null;
  releases.sort((a, b) => (a.time < b.time ? 1 : -1));

  const abandoned = doc.package.abandoned;
  return {
    version: releases[0].version,
    lastPublish: (releases[0].time ?? '').slice(0, 10) || null,
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

async function nuget(name) {
  const found = await json(
    `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(name.toLowerCase())}&take=1`,
  );
  const version = found?.data?.[0]?.version;
  if (typeof version !== 'string') return null;

  // The search index carries no publish date, and NuGet inlines the version
  // list only while a package is small — past roughly a hundred versions the
  // registration index is pages of `@id` and the page must be fetched on its
  // own. One extra request, and without it every large package reads as undated.
  const registration = await json(
    `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(name.toLowerCase())}/index.json`,
  );
  const pages = registration?.items ?? [];
  let entries = pages.flatMap((page) => page.items ?? []);
  if (entries.length === 0) {
    const last = pages[pages.length - 1];
    entries = (await json(last?.['@id'] ?? ''))?.items ?? [];
  }

  const match = entries.find((entry) => entry.catalogEntry?.version === version);
  const deprecation = match?.catalogEntry?.deprecation;

  return {
    version,
    lastPublish: (match?.catalogEntry?.published ?? '').slice(0, 10) || null,
    withdrawn: deprecation
      ? notice(deprecation.message) ??
        (deprecation.alternatePackage?.id
          ? `Deprecated. The publisher names ${deprecation.alternatePackage.id} as the replacement.`
          : 'deprecated by the publisher')
      : null,
    installScripts: null,
    bytes: null,
    funding: null,
  };
}

const READERS = { npm, pypi, crates, gem, packagist, nuget };

/**
 * One package, read from its own registry.
 *
 * Returns the shape the published index uses, so the same `noticesFor` turns it
 * into sentences — with the GitHub-derived fields null, because they cannot be
 * had from here. `live: true` is the caller's cue to label it.
 */
export async function readPackage(registry, name) {
  const reader = READERS[registry];
  if (reader === undefined) return null;

  const reading = await reader(name);
  if (reading === null) return null;

  return {
    ...reading,
    live: true,
    // Not available without a GitHub token, and asking a stranger for one to
    // run a dependency check is a worse trade than the gap it closes.
    repo: null,
    archived: false,
    license: null,
    advisories: null,
    scorecard: null,
    busFactor: null,
    topShare: null,
    installs: null,
    pushedAt: null,
  };
}

/** Read many, a few at a time, skipping anything already known. */
export async function readMissing(wanted) {
  const queue = wanted.slice(0, MAX_LOOKUPS);
  const out = new Map();

  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    const readings = await Promise.all(
      batch.map((entry) => readPackage(entry.registry, entry.name)),
    );
    batch.forEach((entry, index) => {
      const reading = readings[index];
      if (reading !== null) out.set(`${entry.registry}:${entry.name}`, reading);
    });
  }

  return { readings: out, skipped: Math.max(0, wanted.length - queue.length) };
}
