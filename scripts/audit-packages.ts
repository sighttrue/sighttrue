/**
 * Is a repository still mapped to the package it actually publishes?
 *
 * Two different faults, and the second is the one that was live.
 *
 * **Wrong project.** A name that matches is not a package that matches. Every
 * registry states the repository it was released from, so comparing that
 * against the watchlist entry is a source talking about itself.
 *
 * **Abandoned name.** `babel/babel` was mapped to `npm:babel` — genuinely
 * published from that repository, and superseded by `@babel/core` in 2017. The
 * provenance check passes and the reading is still wrong: the page asked "is
 * babel still maintained", answered with a 2017 publish date and a deprecation
 * notice, and linked to a repository that ships every week. `hapijs/hapi`
 * pointed at `npm:hapi` rather than `@hapi/hapi`, `elastic/kibana` at a
 * placeholder, and `rails/rails` at a 2013 npm package when Rails is a Ruby
 * gem. All three "withdrawn by its publisher" findings this project raised
 * last week were this.
 *
 * The tell is the divergence the product already measures, pointed inward: a
 * mapped package that its own publisher withdrew, or that has been silent for
 * years, while the repository behind it is still being pushed to. That is not a
 * dead project. That is a mapping pointing at a name the project left behind.
 *
 * Reports rather than repairs. The watchlist is a committed file and every
 * change to it is meant to be a reviewed commit — a script that edited it would
 * be the same shortcut that produced these rows.
 *
 *   node scripts/audit-packages.ts
 *   node scripts/audit-packages.ts --all      # print the matches too
 */

import { readLiveState, readStaleness, readWatchlist } from '../src/lib/ledger.ts';
import { sleep } from '../src/lib/registries.ts';

/**
 * How long a package may be silent before the mapping, not the project, is the
 * likely explanation — given the repository behind it is still active.
 */
const ABANDONED_DAYS = 730;

const SHOW_ALL = process.argv.includes('--all');
const USER_AGENT = 'sighttrue-agent (+https://github.com/sighttrue/sighttrue)';
const DELAY_MS = 350;

async function json(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

/** `owner/name`, lowercased, out of whatever shape a registry states it in. */
function repoFrom(value: unknown): string | null {
  const text =
    typeof value === 'string'
      ? value
      : typeof (value as { url?: unknown })?.url === 'string'
        ? ((value as { url: string }).url)
        : null;
  if (text === null) return null;

  // The name may contain dots — `web3.py`, `ethers.js`, `next.js` — so only a
  // trailing `.git` is stripped, not everything from the first dot. Written the
  // greedy way first, and it reported three correct mappings as broken.
  const match = /github\.com[/:]([^/]+)\/([^/#?]+)/i.exec(text);
  if (match === null) return null;
  return `${match[1]}/${(match[2] as string).replace(/\.git$/, '')}`.toLowerCase();
}

/** What the registry says this package was published from. */
async function declaredRepo(registry: string, name: string): Promise<string | null> {
  if (registry === 'npm') {
    const body = (await json(`https://registry.npmjs.org/${encodeURIComponent(name)}`)) as {
      repository?: unknown;
      'dist-tags'?: { latest?: string };
      versions?: Record<string, { repository?: unknown }>;
    } | null;
    const latest = body?.['dist-tags']?.latest;
    return (
      repoFrom(latest === undefined ? undefined : body?.versions?.[latest]?.repository) ??
      repoFrom(body?.repository)
    );
  }

  if (registry === 'pypi') {
    const body = (await json(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`)) as {
      info?: { project_urls?: Record<string, unknown>; home_page?: unknown };
    } | null;
    for (const url of Object.values(body?.info?.project_urls ?? {})) {
      const found = repoFrom(url);
      if (found !== null) return found;
    }
    return repoFrom(body?.info?.home_page);
  }

  if (registry === 'crates') {
    const body = (await json(`https://crates.io/api/v1/crates/${encodeURIComponent(name)}`)) as {
      crate?: { repository?: unknown; homepage?: unknown };
    } | null;
    return repoFrom(body?.crate?.repository) ?? repoFrom(body?.crate?.homepage);
  }

  if (registry === 'gem') {
    const body = (await json(`https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`)) as {
      source_code_uri?: unknown;
      homepage_uri?: unknown;
      project_uri?: unknown;
    } | null;
    return (
      repoFrom(body?.source_code_uri) ??
      repoFrom(body?.homepage_uri) ??
      repoFrom(body?.project_uri)
    );
  }

  if (registry === 'packagist') {
    // `vendor/package`, and the slash between them is part of the path.
    const body = (await json(`https://packagist.org/packages/${name}.json`)) as {
      package?: { repository?: unknown };
    } | null;
    return repoFrom(body?.package?.repository);
  }

  if (registry === 'nuget') {
    const body = (await json(
      `https://azuresearch-usnc.nuget.org/query?q=packageid:${encodeURIComponent(name.toLowerCase())}&take=1`,
    )) as { data?: { projectUrl?: unknown }[] } | null;
    const stated = repoFrom(body?.data?.[0]?.projectUrl);
    if (stated !== null) return stated;

    // `projectUrl` is optional and increasingly unset — xunit.v3 leaves it
    // empty. The `repository` block in the catalogue entry is what modern
    // packages fill in instead, and reading only the first would report a
    // correct mapping as unverifiable.
    const registration = (await json(
      `https://api.nuget.org/v3/registration5-gz-semver2/${encodeURIComponent(name.toLowerCase())}/index.json`,
    )) as { items?: { '@id'?: string; items?: { catalogEntry?: { '@id'?: string } }[] }[] } | null;

    const pages = registration?.items ?? [];
    const last = pages.at(-1);
    const entries =
      last?.items ??
      ((await json(last?.['@id'] ?? '')) as { items?: { catalogEntry?: { '@id'?: string } }[] } | null)
        ?.items ??
      [];

    const catalogUrl = entries.at(-1)?.catalogEntry?.['@id'];
    if (catalogUrl === undefined) return null;

    const entry = (await json(catalogUrl)) as { repository?: unknown } | null;
    return repoFrom(entry?.repository);
  }

  // Maven Central's search index publishes no project URL, so there is nothing
  // to check a mapping against. Reported as unstated, which is what it is —
  // the four Maven mappings here were verified by hand against each project's
  // own repository instead, and this says so out loud rather than passing them.
  return null;
}

/**
 * Disagreements that were checked and stand.
 *
 * A registry states where a package was *built*, which is not always where it
 * is written. Microsoft builds every .NET package out of the `dotnet/dotnet`
 * mono-repo, so its catalogue names that for Entity Framework Core — but the
 * readings this project takes are pushes, contributors and bus factor, and
 * about the whole of .NET those answer a different question than about EF Core.
 *
 * Written down with a reason rather than silently skipped. An audit that cries
 * wolf every run is an audit somebody stops reading, and one that hides a
 * disagreement is worse than one that never found it.
 */
const CHECKED_EXCEPTIONS: Record<string, { declared: string; because: string }> = {
  'nuget:Microsoft.EntityFrameworkCore': {
    declared: 'dotnet/dotnet',
    because:
      'the catalogue names the .NET build mono-repo; EF Core is developed in dotnet/efcore and that is what the readings are about',
  },
};

const mapped: { repo: string; registry: string; name: string }[] = [];
for (const entry of readWatchlist()) {
  if (!entry.active) continue;
  for (const packageId of entry.packages ?? []) {
    const cut = packageId.indexOf(':');
    const registry = packageId.slice(0, cut);
    const name = packageId.slice(cut + 1);
    if (registry === 'brew' || name === '') continue;
    mapped.push({ repo: entry.id, registry, name });
  }
}

process.stdout.write(`${mapped.length} package mappings to check.\n\n`);

const wrong: string[] = [];
const unstated: string[] = [];
const excepted: string[] = [];
let agreed = 0;

for (const [index, entry] of mapped.entries()) {
  if (index > 0) await sleep(DELAY_MS);

  const declared = await declaredRepo(entry.registry, entry.name);
  const expected = entry.repo.toLowerCase();
  const line = `${entry.registry}:${entry.name} → ${entry.repo}`;

  if (declared === null) {
    // A package that names no repository. Not evidence of anything either way.
    unstated.push(`${line}  (the registry states no repository)`);
    continue;
  }

  if (declared === expected) {
    agreed += 1;
    if (SHOW_ALL) process.stdout.write(`  ok        ${line}\n`);
    continue;
  }

  // A disagreement somebody already looked at. Still printed, so it can be
  // re-examined when the reason stops holding — an exception that goes quiet is
  // an exception nobody revisits.
  const allowed = CHECKED_EXCEPTIONS[`${entry.registry}:${entry.name}`];
  if (allowed !== undefined && allowed.declared === declared) {
    excepted.push(`${line}\n            registry says ${declared} — kept, because ${allowed.because}`);
    process.stdout.write(`  checked   ${line}\n            registry says ${declared}, kept on purpose\n`);
    continue;
  }

  wrong.push(`${line}\n            the registry says it comes from ${declared}`);
  process.stdout.write(`  MISMATCH  ${line}\n            registry says ${declared}\n`);
}

process.stdout.write(
  `\n${agreed} agree, ${wrong.length} disagree, ${excepted.length} disagree by design, ` +
    `${unstated.length} state no repository.\n`,
);

// ---- the second fault: a name the project has moved on from ---------------

const pushedAt = new Map(readLiveState().map((row) => [row.id, row.pushedAt]));
const today = Date.now();
const stale: string[] = [];

for (const row of readStaleness()) {
  const repoPush = pushedAt.get(row.repo) ?? null;
  if (repoPush === null) continue;

  const repoQuietDays = Math.round((today - Date.parse(repoPush)) / 86_400_000);
  // An active repository is the half of the comparison that makes this mean
  // something. A quiet package under a quiet repository is just a quiet project.
  if (!Number.isFinite(repoQuietDays) || repoQuietDays > 180) continue;

  const packageQuietDays =
    row.lastPublish === null
      ? null
      : Math.round((today - Date.parse(`${row.lastPublish}T00:00:00Z`)) / 86_400_000);

  const withdrawn = row.withdrawn !== null;
  const silent = packageQuietDays !== null && packageQuietDays >= ABANDONED_DAYS;
  if (!withdrawn && !silent) continue;

  stale.push(
    `${row.registry}:${row.name} → ${row.repo}\n` +
      `            package ${withdrawn ? 'withdrawn by its publisher' : `silent ${packageQuietDays} days`}, ` +
      `repository pushed ${repoQuietDays} days ago`,
  );
}

if (stale.length > 0) {
  process.stdout.write('\nPackages the project appears to have moved on from:\n');
  for (const line of stale) process.stdout.write(`  STALE     ${line}\n`);
  process.stdout.write(
    `\n${stale.length} mapping${stale.length === 1 ? '' : 's'} point at a name while the repository behind it is still active.\n` +
      'Check what the project publishes now — usually a scoped successor — and remap or drop by hand.\n',
  );
}

if (unstated.length > 0 && SHOW_ALL) {
  process.stdout.write('\nNo repository stated:\n');
  for (const line of unstated) process.stdout.write(`  ${line}\n`);
}

process.stdout.write(
  wrong.length === 0
    ? '\nEvery mapping is confirmed by the registry it publishes to.\n'
    : '\nEach mismatch is a reading published under the wrong project. Fix data/watchlist.jsonl by hand.\n',
);
