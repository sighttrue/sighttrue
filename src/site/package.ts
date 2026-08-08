import { band, esc, layout } from './render.ts';
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

export type PackageRegistry = 'npm' | 'pypi' | 'crates';

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
};

/** Where the registry itself says this. Every claim here has to be checkable. */
export function registryUrl(registry: PackageRegistry, name: string): string {
  if (registry === 'npm') return `https://www.npmjs.com/package/${name}`;
  if (registry === 'pypi') return `https://pypi.org/project/${name}/`;
  return `https://crates.io/crates/${name}`;
}

const WINDOW_LABEL: Record<AdoptionWindow, string> = {
  week: 'weekly',
  '30d': 'per 30 days',
  '90d': 'per 90 days',
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
    ${metric(
      'Depended on by',
      String(data.dependents),
      `of the ${index.watchlist.active} repositories watched here`,
    )}
  </div>`;

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
${archived}
${readings}
${trend(data.samples, data.window)}
${divergence}

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
    <p><strong>Depended on by</strong> counts only the ${index.watchlist.active} repositories on
    this watchlist, which is curated and partial. It is a floor, not a total.</p>
  </div>`,
  `Readings are taken every ${index.disclosure.cadenceHours} hours at best${
    data.findings === 0 ? '' : `. ${data.findings} findings are on record for ${data.repo}`
  }.`,
)}`;

  const description = `${summarise(data)} Dated readings for the ${registryName} package — downloads, advisories, licence, bus factor — with no verdict attached.`;

  return layout({
    title: `Is ${data.name} still maintained? — ${registryName} readings`,
    description,
    current: '',
    path: packagePath(data.registry, data.name),
    index,
    meta,
    feed: { href: `/repo/${data.repo}.xml`, title: `Sighttrue — ${data.repo}` },
    body,
  });
}
