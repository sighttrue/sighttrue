import { band, esc, layout, SITE_ORIGIN } from './render.ts';
import { isGeneratedNotice } from '../collectors/staleness.ts';
import { registryUrl } from '../lib/verdict.ts';
import type { IndexBundle } from '../types/bundles.ts';
import type { MetaRecord } from '../types/meta.ts';
import type { AdoptionSample, AdoptionWindow } from '../types/adoption.ts';

/**
 * One package, and the question people actually type.
 *
 * "Is X still maintained" is a search, several thousand times a month, for
 * every package anybody depends on. What comes back is a Stack Overflow thread
 * from 2019, a GitHub issue titled "is this dead?", and somebody's opinion. The
 * readings that answer it — when the package was last published, when the
 * repository was last pushed to, whether it is archived, how concentrated its
 * commits are — have been collected here for weeks and were reachable only by
 * knowing which repository publishes the package, which is precisely what
 * somebody asking the question does not know.
 *
 * The page answers with measurements and never with a verdict. It does not say
 * maintained, unmaintained, dead, safe or risky: those are conclusions, they
 * belong to the reader, and this project measures none of them. What it can do
 * is put every dated fact in one place with its source beside it, which is the
 * work the reader would otherwise do across five tabs.
 */

/**
 * Registries whose names are path-shaped.
 *
 * Maven is absent, and deliberately. Its names are `group:artifact`, which is
 * not a filename on Windows and not a URL segment anywhere; giving it a page
 * would mean inventing a spelling for a package that has one already. It is
 * still collected, still answered by `/api/verdict`, and still read out of a
 * pasted manifest — it just has no page of its own.
 */
export type PackageRegistry = 'npm' | 'pypi' | 'crates' | 'gem' | 'packagist' | 'nuget';

export interface PackagePageData {
  registry: PackageRegistry;
  /** As the registry spells it. */
  name: string;
  /** Watched repository that publishes it. */
  repo: string;
  archived: boolean;
  /** Last push to the repository, ISO 8601. */
  pushedAt: string | null;
  license: string | null;
  scorecard: number | null;
  advisories: number | null;
  /** Latest release tag on the repository, which is not the published version. */
  latestReleaseTag: string | null;
  /** Downloads over `window`, and the readings behind the trend. */
  installs: number | null;
  window: AdoptionWindow | null;
  samples: AdoptionSample[];
  /** When the registry says the newest version was published. */
  lastPublish: string | null;
  version: string | null;
  /** The publisher's own withdrawal notice — npm deprecated, PyPI yanked. */
  withdrawn: string | null;
  /** Install-time hooks npm publishes. Null where a registry has no such field. */
  installScripts: string | null;
  /** Bytes the published artefact unpacks to. */
  bytes: number | null;
  /** Where the maintainers ask to be funded. */
  funding: string | null;
  /** Contributors accounting for half the commits, and the top share. */
  busFactor: number | null;
  topShare: number | null;
  /** Watched repositories whose manifest names this package. */
  dependents: number;
  /** Findings recorded against the publishing repository. */
  findings: number;
  /** `YYYY-MM-DD` UTC the page is built for. */
  today: string;
}

const REGISTRY_NAME: Record<PackageRegistry, string> = {
  npm: 'npm',
  pypi: 'PyPI',
  crates: 'crates.io',
  gem: 'RubyGems',
  packagist: 'Packagist',
  nuget: 'NuGet',
};

/**
 * The word each registry uses for "do not install this".
 *
 * Their word, not a translation of it. The notice republishes a publisher's own
 * instruction, and a page that says "NuGet marks this yanked" is putting PyPI's
 * vocabulary in NuGet's mouth about somebody else's package.
 */
const WITHDRAWN_VERB: Record<PackageRegistry, string> = {
  npm: 'deprecated',
  pypi: 'yanked',
  crates: 'yanked',
  gem: 'yanked',
  packagist: 'abandoned',
  nuget: 'deprecated',
};

/**
 * Where the registry itself says this — one definition, shared with the verdict
 * endpoint, so a package's page and the answer an agent gets cite the same URL.
 */
export { registryUrl } from '../lib/verdict.ts';

const WINDOW_LABEL: Record<AdoptionWindow, string> = {
  week: 'weekly',
  '30d': 'per 30 days',
  '90d': 'per 90 days',
  // All-time, and named as such so it can never be read beside a weekly
  // figure as though they measured the same thing.
  total: 'all time',
};

export function daysBetween(iso: string, today: string): number | null {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - at) / 86_400_000);
}

/** Elapsed time at the precision the answer deserves. Never rounded upward. */
export function elapsed(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${(days / 365).toFixed(1)} years ago`;
}

/** Bytes at the precision the number deserves, never rounded to nothing. */
function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

function metric(label: string, value: string, note = ''): string {
  return `<div class="metric">
    <span class="label">${esc(label)}</span>
    <span class="metric-value num">${esc(value)}</span>
    ${note === '' ? '' : `<span class="label">${esc(note)}</span>`}
  </div>`;
}

/**
 * The answer, assembled from the record rather than written about it.
 *
 * Every clause restates a number rendered on this page, in the order somebody
 * asking the question needs them: what the registry has, what the repository
 * has, and who is doing the work. No clause is added when its reading is
 * missing — an absent fact is left out rather than described as unknown in a
 * sentence, because a sentence full of unknowns reads as a conclusion about the
 * package instead of a gap in the record.
 */
export function summarise(data: PackagePageData): string {
  const said: string[] = [];

  const published = data.lastPublish === null ? null : daysBetween(data.lastPublish, data.today);
  if (published !== null && data.lastPublish !== null) {
    // The name is written exactly as the registry spells it, at the start of a
    // sentence and everywhere else. Capitalising it to open a sentence would
    // rename the package.
    said.push(
      `${data.name} last published${data.version === null ? '' : ` ${data.version}`} on ${data.lastPublish.slice(0, 10)}, ${elapsed(published)}`,
    );
  }

  const pushed = data.pushedAt === null ? null : daysBetween(data.pushedAt, data.today);
  if (pushed !== null) {
    said.push(
      `Its repository was last pushed to ${elapsed(pushed)}${data.archived ? ' and is archived' : ''}`,
    );
  } else if (data.archived) {
    said.push('Its repository is archived');
  }

  if (data.busFactor !== null) {
    said.push(
      `Half its commits come from ${data.busFactor} ${data.busFactor === 1 ? 'person' : 'people'}`,
    );
  }

  if (said.length === 0) {
    return `Nothing has been collected for ${data.name} yet. It is on the watchlist and will appear after the next run.`;
  }

  return `${said.join('. ')}.`;
}

/**
 * The download trend, as bars.
 *
 * Drawn only from readings this project took, and labelled with the window the
 * registry reports over — npm and PyPI publish a rolling week, crates.io ninety
 * days. Putting those on one axis without saying so would invite a comparison
 * between two different measurements.
 */
function trend(samples: readonly AdoptionSample[], window: AdoptionWindow | null): string {
  if (samples.length < 3 || window === null) return '';

  const W = 100;
  const H = 24;
  const peak = Math.max(1, ...samples.map((sample) => sample.count));
  const step = W / samples.length;
  const width = Math.max(step * 0.7, 0.2);

  const bars = samples
    .map((sample, i) => {
      const h = (sample.count / peak) * H;
      return `<rect class="mark-quiet" x="${(i * step).toFixed(3)}" y="${(H - h).toFixed(2)}" width="${width.toFixed(3)}" height="${h.toFixed(2)}"><title>${esc(sample.at.slice(0, 10))}: ${sample.count.toLocaleString('en')}</title></rect>`;
    })
    .join('');

  const first = samples[0] as AdoptionSample;
  const last = samples[samples.length - 1] as AdoptionSample;

  return `<figure class="chart">
    <figcaption class="label">Downloads ${esc(WINDOW_LABEL[window])} — ${samples.length} readings, peak ${peak.toLocaleString('en')}</figcaption>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
         aria-label="Downloads ${esc(WINDOW_LABEL[window])} from ${esc(first.at.slice(0, 10))} to ${esc(last.at.slice(0, 10))}, peak ${peak.toLocaleString('en')}.">
      ${bars}
    </svg>
    <div class="strip-scale">
      <span class="label">${esc(first.at.slice(0, 10))}</span>
      <span class="label">each bar is one reading, not one day</span>
      <span class="label">${esc(last.at.slice(0, 10))}</span>
    </div>
  </figure>`;
}

export function packagePath(registry: PackageRegistry, name: string): string {
  return `/${registry}/${name}`;
}

/**
 * The two ways to take this reading with you.
 *
 * A badge goes in the README of everything that depends on the package, which
 * is the only distribution here that compounds — and it costs a static file
 * that already exists. The endpoint below it is for the reader who is not a
 * person: an agent that has this page open is one line away from being able to
 * ask the same question about every other package, and until now nothing on
 * the page said so.
 */
function takeItWithYou(registry: PackageRegistry, name: string, repo: string): string {
  const badge = `${SITE_ORIGIN}/badge/${registry}/${name}.svg`;
  const markdown = `[![Sighttrue](${badge})](${SITE_ORIGIN}${packagePath(registry, name)})`;
  const target = `embed-${registry}-${name.replace(/[@/]/g, '-')}`;

  return `<div class="method-prose">
    <p>The figure updates on its own. It is read every four hours and served as a static file, so
    nothing calls back to you and there is nothing to install.</p>
    <p><img src="/badge/${esc(registry)}/${esc(name)}.svg" alt="Sighttrue badge for ${esc(name)}" height="20"></p>
    <pre class="method-code" id="${esc(target)}">${esc(markdown)}</pre>
    <p class="repo-facts">
      <button class="label" type="button" data-copy="${esc(target)}">Copy the markdown</button>
      <a class="label" href="/repo/${esc(repo)}.xml">Follow ${esc(repo)} by feed</a>
    </p>
    <p><strong>Reading this as an agent?</strong> Every figure above is one call:</p>
    <pre class="method-code">curl '${SITE_ORIGIN}/api/verdict?pkg=${esc(registry)}:${esc(name)}'</pre>
    <p>Or connect the MCP server at <code>${SITE_ORIGIN}/api/mcp</code> — no key, no account — and
    ask the same question about anything else you are about to install. Every reading it returns
    carries the address of the body that published it.</p>
  </div>`;
}

export function renderPackagePage(
  data: PackagePageData,
  index: IndexBundle,
  meta: MetaRecord,
): string {
  const registryName = REGISTRY_NAME[data.registry];
  const published = data.lastPublish === null ? null : daysBetween(data.lastPublish, data.today);
  const pushed = data.pushedAt === null ? null : daysBetween(data.pushedAt, data.today);

  const readings = `<div class="finding-metrics">
    ${metric(
      'Last published',
      published === null ? 'unread' : elapsed(published),
      data.lastPublish === null ? `${registryName} could not be read` : `${registryName}, ${data.version ?? 'version unstated'}`,
    )}
    ${metric(
      'Last push',
      pushed === null ? 'unknown' : elapsed(pushed),
      data.archived ? 'repository archived' : 'to the repository, not the package',
    )}
    ${
      data.installs === null
        ? ''
        : metric(
            'Downloads',
            data.installs.toLocaleString('en'),
            data.window === null ? '' : WINDOW_LABEL[data.window],
          )
    }
    ${
      data.busFactor === null
        ? ''
        : metric(
            'Bus factor',
            String(data.busFactor),
            data.topShare === null
              ? 'contributors behind half the commits'
              : `top contributor wrote ${Math.round(data.topShare * 100)}%`,
          )
    }
    ${
      data.scorecard === null
        ? ''
        : metric(
            'OpenSSF scorecard',
            `${data.scorecard.toFixed(1)} of 10`,
            index.health.median === null
              ? 'declared practices, not safety'
              : `median here ${index.health.median.toFixed(1)}`,
          )
    }
    ${
      data.advisories === null
        ? ''
        : metric('Advisories', String(data.advisories), 'OSV, all time, all versions')
    }
    ${metric('Licence', data.license ?? 'unidentified', 'as GitHub reports it')}
    ${
      data.bytes === null
        ? ''
        : metric('Install weight', humanBytes(data.bytes), `${registryName}, unpacked`)
    }
    ${
      data.installScripts === null
        ? ''
        : metric('Runs on install', data.installScripts, 'on the installing machine')
    }
    ${metric(
      'Depended on by',
      String(data.dependents),
      `of the ${index.watchlist.active} repositories watched here`,
    )}
  </div>`;

  // The publisher's own instruction not to install this. First on the page,
  // above every other reading, because nothing else here matters if the answer
  // is "they have told you to stop".
  //
  // What follows the flag is only called their notice when it is one. RubyGems
  // and Packagist can set the flag with no text at all — `yanked: true`,
  // `abandoned: true` — and the sentence shown then is this project's, written
  // to describe the flag. Crediting it to the publisher would be putting words
  // in the mouth of somebody who wrote none.
  const theirWords = isGeneratedNotice(data.withdrawn)
    ? 'the registry sets the flag and publishes no message with it'
    : "the publisher's own notice, republished unchanged";

  const withdrawn =
    data.withdrawn === null
      ? ''
      : `<div class="notice notice-alert"><strong>${esc(registryName)} marks this ${
          WITHDRAWN_VERB[data.registry]
        }</strong>
      ${esc(data.withdrawn)} — ${theirWords}.</div>`;

  const funding =
    data.funding === null
      ? ''
      : `<p class="band-note">The maintainers ask to be funded at
        <a href="${esc(data.funding)}">${esc(data.funding)}</a>, which ${esc(registryName)} carries
        in the package's own metadata.</p>`;

  const archived = data.archived
    ? `<div class="notice notice-alert"><strong>The repository is archived</strong>
      GitHub reports ${esc(data.repo)} as archived, which means its owner has marked it read-only.
      Published versions keep working and keep being downloaded; what stops is anything new. This
      is the owner's own flag, not a reading taken here.</div>`
    : '';

  // Two dates that answer different questions and are constantly confused for
  // each other. Saying so only when they actually disagree keeps it a reading
  // rather than boilerplate on four hundred pages.
  const divergence =
    published !== null && pushed !== null && published - pushed >= 180
      ? `<p class="band-note">The repository has been pushed to more recently than the package has
        been published — ${esc(elapsed(pushed))} against ${esc(elapsed(published))}. Commits are what a
        maintainer does for themselves; a publish is what reaches the people depending on it.</p>`
      : '';

  const body = `
<section class="hero">
  <h1 class="hero-thesis">Is ${esc(data.name)} still maintained?</h1>
  <p class="hero-sub">${esc(summarise(data))}</p>
  <div class="repo-facts">
    <span class="label">${esc(registryName)}</span>
    <a class="label" href="${esc(registryUrl(data.registry, data.name))}">On ${esc(registryName)}</a>
    <a class="label" href="/repo/${esc(data.repo)}">Every signal for ${esc(data.repo)}</a>
    <a class="label" href="https://github.com/${esc(data.repo)}">View on GitHub</a>
  </div>
</section>
${withdrawn}
${archived}
${readings}
${trend(data.samples, data.window)}
${divergence}
${funding}

${band(
  'What these numbers are, and are not',
  `<p class="band-note">Every figure above is a reading taken from a public source and dated. None
  of them is a judgement: this page does not say whether ${esc(data.name)} is maintained, safe or
  worth using, because those are conclusions and the readings are what the reader needs to reach
  their own.</p>
  <div class="method-prose">
    <p><strong>Last published</strong> comes from ${esc(registryName)} and is the newest version's
    release date. A package with no recent publish is not necessarily abandoned — a finished
    library is finished.</p>
    <p><strong>Last push</strong> is to the repository that publishes the package, which is a
    different thing from the package itself and often has a different date.</p>
    <p><strong>The scorecard</strong> is the OpenSSF Scorecard published by Google Open Source
    Insights, not computed here. It measures declared practices such as code review and workflow
    permissions. A low score is not a statement that a project is unsafe.</p>
    <p><strong>Advisories</strong> are OSV totals for all time and all versions, so a mature,
    well-patched project carries more than a young one. A high count is not a warning on its own.</p>
    <p><strong>The bus factor</strong> is how many contributors account for half of all commits,
    read from the commit history. One person doing the work is a fact about a project, not a
    fault in it.</p>
    <p><strong>Runs on install</strong> names the scripts npm executes on the machine doing the
    installing. Naming them is a fact about the package. It is not a claim that any of them does
    anything untoward — most download a platform binary, which is why the package works at all —
    and this project does not read what they contain.</p>
    <p><strong>Install weight</strong> is the size of the published artefact as the registry
    reports it, not the size of everything it pulls in with it.</p>
    <p><strong>Depended on by</strong> counts only the ${index.watchlist.active} repositories on
    this watchlist, which is curated and partial. It is a floor, not a total.</p>
  </div>`,
  `Readings are taken every ${index.disclosure.cadenceHours} hours at best${
    data.findings === 0 ? '' : `. ${data.findings} findings are on record for ${data.repo}`
  }.`,
)}

${band(
  'Take this reading with you',
  takeItWithYou(data.registry, data.name, data.repo),
  'The badge and the endpoint read the same published file this page does, so they cannot disagree with it.',
)}`;

  const description = `${summarise(data)} Dated readings for the ${registryName} package — downloads, advisories, licence, bus factor — with no verdict attached.`;

  return layout({
    title: `Is ${data.name} still maintained? — ${registryName} readings`,
    description,
    current: '',
    path: packagePath(data.registry, data.name),
    index,
    meta,
    // The repository's feed, named for the package, because that is what the
    // reader of this page is following. No package gets a feed of its own:
    // every tracked repository here publishes exactly one tracked package, so
    // a second file would be the same items under a different address.
    feed: {
      href: `/repo/${data.repo}.xml`,
      title: `Sighttrue — ${data.name} (${data.repo})`,
    },
    body,
  });
}
