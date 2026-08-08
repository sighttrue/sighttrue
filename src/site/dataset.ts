import { band, esc, layout, SITE_ORIGIN } from './render.ts';
import type { IndexBundle } from '../types/bundles.ts';
import type { MetaRecord } from '../types/meta.ts';

/**
 * The published files, described well enough to be cited.
 *
 * Every bundle has been downloadable for weeks and nothing said what any of
 * them contained, what could be done with them, or how to refer to one in a
 * sentence somebody else would read. A dataset nobody can describe is a dataset
 * nobody cites, and a citation is the only form of distribution here that keeps
 * working for years without anybody maintaining it.
 *
 * The line this page has to hold: almost nothing here was measured by this
 * project. Scorecards are Google's, advisories are OSV's, end-of-life dates are
 * endoflife.date's, incidents are the providers' own words. What is original is
 * the collection, the dating, and the keeping. A page that blurred that would
 * be claiming other people's work, and it would also mislead the exact reader
 * most likely to check.
 */

export interface DatasetResource {
  /** File name under /data. */
  name: string;
  /** What one row is. */
  row: string;
  /** How many of them there are right now. */
  count: number | null;
  countLabel: string;
  /** Who actually produced the figures. */
  source: string;
  bytes: number | null;
}

/**
 * Described from the index bundle, so a count here cannot drift from the count
 * the site renders. A file cannot claim 441 incidents on a day the ledger holds
 * 461, which is the ordinary way documentation starts lying.
 */
export function resourcesFrom(index: IndexBundle, sizes: Map<string, number>): DatasetResource[] {
  const size = (name: string): number | null => sizes.get(name) ?? null;

  return [
    {
      name: 'stack-index.json',
      row: 'one tracked package, keyed registry:name',
      count: null,
      countLabel: 'every package on the watchlist',
      source:
        'Downloads from the registries, scorecards from Google Open Source Insights, advisory counts from OSV, licence and archive state from GitHub, publish dates and install scripts from the registries.',
      bytes: size('stack-index.json'),
    },
    {
      name: 'incidents.json',
      row: 'one announced provider incident, with start and resolution times',
      count: index.incidents.total,
      countLabel: `in the last ${index.incidents.windowDays} days, of a longer record`,
      source:
        "The providers' own status APIs, republished unchanged and kept after their status pages stop carrying them.",
      bytes: size('incidents.json'),
    },
    {
      name: 'eol.json',
      row: 'one release line of one product, with its published end-of-life date',
      count: index.lifecycle.dated,
      countLabel: 'release lines with a date',
      source: 'endoflife.date, republished unchanged. Nothing is inferred.',
      bytes: size('eol.json'),
    },
    {
      name: 'models.json',
      row: 'one language model, with price per million tokens and context window',
      count: index.models.available,
      countLabel: `models across ${index.models.providers} providers`,
      source: 'OpenRouter’s catalogue, read daily.',
      bytes: size('models.json'),
    },
    {
      name: 'ecosystem.json',
      row: 'registry publish dates, base image sizes, question volume, near-miss names',
      count: index.staleness.measured,
      countLabel: 'packages by real publish date, plus base images and tags',
      source: 'npm, PyPI, crates.io, Docker Hub and Stack Overflow.',
      bytes: size('ecosystem.json'),
    },
    {
      name: 'compare.json',
      row: 'one watched repository, flattened across every axis read here',
      count: index.watchlist.active,
      countLabel: 'repositories',
      source: 'GitHub, plus the readings above joined onto it.',
      bytes: size('compare.json'),
    },
    {
      name: 'index.json',
      row: 'every summary the site renders from',
      count: null,
      countLabel: 'one document',
      source: 'Derived here from all of the above.',
      bytes: size('index.json'),
    },
  ];
}

/**
 * A Frictionless Data descriptor, which is what a data portal reads.
 *
 * Machine-readable metadata costs one static file and is the difference
 * between a directory of JSON and something a catalogue can index.
 */
export function renderDataPackage(
  resources: readonly DatasetResource[],
  generatedAt: string,
): string {
  return `${JSON.stringify(
    {
      profile: 'data-package',
      name: 'sighttrue',
      title: 'Sighttrue — a dated record of open-source dependency and provider readings',
      description:
        'Eleven readings across roughly four hundred hand-picked open-source repositories and the services they depend on, taken every four hours and committed to a public git repository as they are taken.',
      homepage: SITE_ORIGIN,
      version: generatedAt.slice(0, 10),
      created: generatedAt,
      licenses: [
        {
          name: 'MIT',
          path: 'https://github.com/sighttrue/sighttrue/blob/main/LICENSE',
          title: 'MIT License',
        },
      ],
      // Named rather than implied. Most figures here belong to somebody else
      // and a catalogue entry that omitted them would be claiming their work.
      sources: [
        { title: 'OSV', path: 'https://osv.dev' },
        { title: 'Google Open Source Insights', path: 'https://deps.dev' },
        { title: 'endoflife.date', path: 'https://endoflife.date' },
        { title: 'npm registry', path: 'https://registry.npmjs.org' },
        { title: 'PyPI', path: 'https://pypi.org' },
        { title: 'crates.io', path: 'https://crates.io' },
        { title: 'GitHub REST API', path: 'https://api.github.com' },
        { title: 'Provider status pages', path: `${SITE_ORIGIN}/incidents` },
      ],
      resources: resources.map((resource) => ({
        name: resource.name.replace(/\.json$/, ''),
        path: `${SITE_ORIGIN}/data/${resource.name}`,
        format: 'json',
        mediatype: 'application/json',
        ...(resource.bytes === null ? {} : { bytes: resource.bytes }),
        description: `One row: ${resource.row}. ${resource.source}`,
      })),
    },
    null,
    2,
  )}\n`;
}

export function renderDataset(
  index: IndexBundle,
  meta: MetaRecord,
  resources: readonly DatasetResource[],
): string {
  const table = `<div class="wrap"><table class="readout">
  <caption class="label">Every published file</caption>
  <thead><tr>
    <th scope="col">File</th>
    <th scope="col">One row is</th>
    <th scope="col" class="n">Rows</th>
    <th scope="col">Who produced the figures</th>
  </tr></thead>
  <tbody>${resources
    .map(
      (resource) => `<tr>
      <td><a href="/data/${esc(resource.name)}">${esc(resource.name)}</a></td>
      <td>${esc(resource.row)}</td>
      <td class="n num">${
        resource.count === null
          ? '<span class="dim">—</span>'
          : `<span class="big num">${resource.count.toLocaleString('en')}</span>`
      }<br><span class="label">${esc(resource.countLabel)}</span></td>
      <td class="dim">${esc(resource.source)}</td>
    </tr>`,
    )
    .join('')}</tbody>
</table></div>`;

  return layout({
    title: 'The data — every reading, as files you can cite',
    description:
      'Eleven readings across four hundred open-source repositories and the services they depend on, published as JSON, updated every four hours, and committed to a public repository as they are taken.',
    current: '',
    path: '/dataset',
    index,
    meta,
    body: `<section class="hero">
  <h1 class="hero-thesis">Take the data.</h1>
  <p class="hero-sub">
    Every reading on this site is a file, served from the same deployment as the pages, updated
    every ${index.disclosure.cadenceHours} hours, and committed to a public repository as it is
    taken. No key, no account, no rate limit — and a commit for every figure, so a number
    published on a date can be checked against the run that recorded it.
  </p>
  <div class="hero-figures">
    <div class="figure"><span class="figure-value num">${resources.length}</span><span class="label">Published files</span></div>
    <div class="figure"><span class="figure-value num">${index.watchlist.active}</span><span class="label">Repositories read</span></div>
    <div class="figure"><span class="figure-value num">${index.incidents.observedDays}</span><span class="label">Days of incident history</span></div>
  </div>
</section>

${band(
  'The files',
  table,
  'Machine-readable metadata for all of them is at /data/datapackage.json, in the Frictionless Data format a catalogue reads.',
)}

${band(
  'What this project actually did',
  `<div class="method-prose">
    <p><strong>Almost none of these figures were measured here.</strong> Advisory counts belong to
    OSV. Scorecards are computed by Google Open Source Insights. End-of-life dates are published by
    endoflife.date. Incidents are the providers' own announcements. Publish dates and install
    scripts come from the registries, and forks, stars and licences from GitHub.</p>
    <p>What is original is the collection, the dating, and the keeping: a record of when each of
    those said what, held after several of them stopped holding it themselves. A status page
    carries its last fifty incidents; a registry publishes no price history; an end-of-life date is
    announced years ahead and remembered by nobody on the day.</p>
    <p>So a paper citing a scorecard should cite Open Source Insights. A paper citing
    <em>what the record said on a given date</em> is citing this.</p>
  </div>`,
  'The distinction matters in both directions: claiming these measurements would be taking somebody else’s work, and hiding the sources would leave a reader unable to check them.',
)}

${band(
  'Citing it',
  `<div class="method-prose">
    <p>The repository carries a <code>CITATION.cff</code>, so GitHub renders a citation directly.
    In text:</p>
    <pre class="method-code">Sighttrue. Sighttrue: a dated public record of open-source dependency
and provider readings. ${esc(SITE_ORIGIN)} (accessed YYYY-MM-DD).</pre>
    <p>Cite an access date rather than a version. Everything here moves every
    ${index.disclosure.cadenceHours} hours, and the commit history is what makes a dated claim
    checkable — the repository holds the exact bytes that were served on any day it ran.</p>
  </div>`,
)}

${band(
  'What it will not support',
  `<div class="method-prose">
    <p>The watchlist is <strong>curated and partial</strong> — roughly ${index.watchlist.active}
    repositories chosen by hand, not a sample of anything. It cannot support a claim about open
    source in general, and a package that is absent is not being judged.</p>
    <p>No figure here states whether a package is safe, unsafe or recommended, and none should be
    presented as though it did. A count of announced incidents measures disclosure as much as
    reliability. Advisory counts are all-time totals, so a mature project carries more than a
    young one.</p>
    <p>Readings are four-hourly at best and nothing is real-time. Dependency readings come from
    declared manifests rather than lockfiles, so they describe direct dependencies and not the
    transitive tree.</p>
  </div>`,
  'Every one of these limits is also stated beside the figure it applies to, on the page that renders it.',
)}`,
  });
}
