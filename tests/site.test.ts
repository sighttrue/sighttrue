import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CHARGING, TOKEN } from '../src/lib/payment.ts';
import { renderEventPage } from '../src/site/event.ts';
import { renderIndex, renderLens, renderMethod, stripSvg } from '../src/site/render.ts';
import type { IndexBundle, LensBundle, StripMark } from '../src/types/bundles.ts';
import type { EventRecord } from '../src/types/events.ts';
import { EMPTY_META, type MetaRecord } from '../src/types/meta.ts';

function meta(over: Partial<MetaRecord> = {}): MetaRecord {
  return { ...EMPTY_META, lastSuccessfulRunAt: '2026-08-04T04:17:00Z', job: 'pulse', ...over };
}

function mark(over: Partial<StripMark> = {}): StripMark {
  return {
    id: 'a/one',
    name: 'a/one',
    delta: 0,
    multiplier: 1,
    capped: false,
    state: 'quiet',
    forks: 100,
    stars: 1000,
    language: 'TypeScript',
    category: 'devtool',
    ...over,
  };
}

function index(over: Partial<IndexBundle> = {}): IndexBundle {
  return {
    strip: [],
    scorecard: { resolved: 0, followed: 0, rate: null, windowDays: 7, pending: 0 },
    today: [],
    watchlist: { total: 400, active: 400, byCategory: { devtool: 400 } },
    archive: { measured: 0, from: null, to: null, rows: 0 },
    coverage: [
      { category: 'devtool', repositories: 400, measured: 0, forksAdded: null, findings: 0, busiest: null },
    ],
    calibration: [],
    adoption: { measured: 0, unread: 0, weekly: 0, weeklyPackages: 0, top: [], lifetime: [] },
    models: { available: 0, providers: 0, withdrawn: 0, cheapest: [], dearest: [], moved: [], perContext: [] },
    lifecycle: { products: 0, dated: 0, ended: 0, approaching: 0, soon: [], supported: [] },
    incidents: { windowDays: 90, providers: 0, total: 0, timed: 0, medianMinutes: null, observedDays: 0, byProvider: [], recent: [] },
  staleness: { measured: 0, unread: 0, medianDays: null, overAYear: 0, quietest: [], byRegistry: [] },
  advisories: { registries: 0, total: 0, byRegistry: [] },
  questions: { windowDays: 0, tags: 0, total: 0, medianChange: null, busiest: [], holding: [], fading: [] },
  images: { tags: 0, images: 0, stalestDays: null, heaviest: [], stalest: [] },
  names: { swept: 0, found: 0, byPackage: [] },
  contributors: { measured: 0, singleAuthor: 0, medianBusFactor: null, concentrated: [] },
  trending: { readAt: null, projects: 0, measured: 0, singleAuthor: 0, rising: [] },
    hiring: { month: null, sample: 0, previousMonth: null, previousSample: 0, top: [], rising: [], falling: [] },
    divergence: { compared: 0, median: null, used: [], watched: [] },
    health: { scored: 0, unscored: 0, median: null, advisories: 0, weakest: [] },
    lenses: {
      ships: { status: 'active', count: 0 },
      forks: { status: 'active', count: 0 },
      demand: { status: 'pending', count: 0 },
      stack: { status: 'pending', count: 0 },
      lineage: { status: 'pending', count: 0 },
    },
    disclosure: { watchlistCurated: true, cadenceHours: 4, minBaselineDays: 14 },
    ...over,
  };
}

function event(over: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'fork-spike:a/one:2026-08-04',
    kind: 'fork-spike',
    repo: 'a/one',
    detectedAt: '2026-08-04T04:17:00Z',
    confidence: 'confirmed',
    summaryState: 'summarised',
    summary: "Forks rose by 60 over 24 hours, 24× this repository's 19-day baseline.",
    summarySource: 'model',
    evidenceUrl: 'https://github.com/a/one',
    metrics: { forksAdded: 60, observationHours: 24, multiplier: 24 },
    supersedes: null,
    ...over,
  };
}

function lens(over: Partial<LensBundle> = {}): LensBundle {
  return {
    lens: 'forks',
    status: 'active',
    records: [],
    windowDays: 90,
    archives: [],
    count: 0,
    withdrawn: 0,
    ...over,
  };
}

const COPY = { title: 'Forks', heading: 'Fork activity', noun: 'fork spike' };

describe('required states', () => {
  it('says the watchlist was checked and nothing crossed the threshold', () => {
    // A quiet instrument reporting nothing detected is working correctly.
    const html = renderIndex(index(), meta());
    expect(html).toContain('Nothing crossed the threshold');
    expect(html).toContain('400 repositories were checked');
  });

  it('distinguishes a lens with no collector from a lens that found nothing', () => {
    const quiet = renderLens(lens(), index(), meta(), COPY);
    const notMeasured = renderLens(lens({ status: 'pending' }), index(), meta(), COPY);

    expect(quiet).toContain('Nothing crossed the threshold');
    expect(notMeasured).toContain('Not measured yet');
    expect(notMeasured).toContain('not because nothing happened');
  });

  it('separates a detector that found nothing from one that measured nothing', () => {
    // These are opposite facts and they wore the same sentence for four days.
    // "Nothing crossed the threshold" is a reading about open source. A
    // detector with nothing ever measured against its bar is a reading about
    // us, and calling it quiet credits an empty page to a calm ecosystem.
    const detector = {
      collector: 'fork-spike',
      metric: 'multiplier against own baseline',
      threshold: 3,
      days: 4,
      crossed: 0,
      peak: null,
      peakShare: null,
    };

    const broken = renderLens(
      lens(),
      index({ calibration: [{ ...detector, measured: 0 }] }),
      meta(),
      COPY,
    );
    const quiet = renderLens(
      lens(),
      index({ calibration: [{ ...detector, measured: 900 }] }),
      meta(),
      COPY,
    );

    expect(broken).toContain('This reading is not working');
    expect(broken).toContain('fault in the instrument');
    expect(broken).not.toContain('Nothing crossed the threshold');

    expect(quiet).toContain('Nothing crossed the threshold');
    expect(quiet).not.toContain('This reading is not working');
  });

  it('calls a lens working while any one of its detectors still measures', () => {
    // Forks reads two. One dead detector is a fault worth fixing and not a
    // reason to tell a reader the whole reading is broken.
    const html = renderLens(
      lens(),
      index({
        calibration: [
          { collector: 'fork-spike', metric: 'm', threshold: 3, days: 4, measured: 0, crossed: 0, peak: null, peakShare: null },
          { collector: 'fork-outlier', metric: 'm', threshold: 8, days: 4, measured: 22, crossed: 22, peak: 66, peakShare: 8.25 },
        ],
      }),
      meta(),
      COPY,
    );

    expect(html).toContain('Nothing crossed the threshold');
    expect(html).not.toContain('This reading is not working');
  });

  it('reports how many baselines are still forming, without inventing multipliers', () => {
    const html = renderIndex(
      index({ strip: [mark({ state: 'forming', multiplier: null }), mark({ id: 'b/two' })] }),
      meta(),
    );
    expect(html).toContain('Baseline forming');
    expect(html).toContain('1 of 2 repositories');
    expect(html).toContain('none is implied');
  });

  it('surfaces a partial run rather than hiding it', () => {
    const html = renderIndex(index(), meta({ partial: true, collectorsErrored: ['releases: 502'] }));
    expect(html).toContain('most recent run was partial');
  });

  it('renders the exact reading time server-side, so it survives without scripting', () => {
    const html = renderIndex(index(), meta());
    expect(html).toContain('2026-08-04 04:17 UTC');
    expect(html).toContain('data-stale-after="480"');
  });

  it('says there is no reading yet before the first run', () => {
    const html = renderIndex(index(), meta({ lastSuccessfulRunAt: null }));
    expect(html).toContain('No reading yet');
  });
});

describe('the velocity strip', () => {
  it('draws the baseline explicitly, so the comparison is visible', () => {
    // A comparison whose reference the reader cannot see is not checkable.
    const svg = stripSvg([mark(), mark({ id: 'b/two' })], new Set());
    expect(svg).toContain('baseline-rule');
    expect(svg).toContain("this repository's normal");
  });

  it('gives a confirmed spike the alert treatment and a quiet repository none', () => {
    const svg = stripSvg([mark({ state: 'confirmed', multiplier: 30 }), mark({ id: 'b/two' })], new Set());
    expect(svg).toContain('mark-confirmed');
    expect(svg).toContain('mark-quiet');
  });

  it('draws a forming baseline as an outline rather than a zero-height bar', () => {
    // "Not measured yet" must not render as "measured at zero".
    const svg = stripSvg(
      [mark({ state: 'forming', multiplier: null }), mark({ id: 'b/two', state: 'quiet' })],
      new Set(),
    );
    expect(svg).toContain('mark-forming');
  });

  it('still draws the comb before any baseline has filled', () => {
    // This used to refuse, on the grounds that a flat comb is fifty kilobytes
    // of SVG saying nothing. That reasoning was about information and it cost
    // the product its face: for the first fourteen days the page had no chart,
    // no image, and nothing anybody would remember. A comb of outlines is not
    // nothing — it says these are being measured and none has moved.
    const nothing = Array.from({ length: 400 }, (_, i) =>
      mark({ id: `r${i}/x`, state: 'forming', multiplier: null }),
    );
    const html = stripSvg(nothing, new Set());

    expect(html).toContain('<rect');
    expect(html).toContain('strip-forming');
    // Outlines, never fills. "Not measured yet" must never look like a reading.
    expect(html).not.toContain('mark-quiet');
    expect(html).toContain('All baselines still forming');
    expect(html).toContain('400 repositories');
  });

  it('keeps a forming comb cheap enough to serve', () => {
    // Four hundred marks is the whole point, but it still has to fit in a page
    // that is thirty kilobytes rather than becoming most of one.
    const nothing = Array.from({ length: 400 }, (_, i) =>
      mark({ id: `r${i}/x`, state: 'forming', multiplier: null }),
    );
    expect(stripSvg(nothing, new Set()).length).toBeLessThan(60_000);
  });

  it('carries a text alternative, since the table below is the accessible path', () => {
    const svg = stripSvg([mark({ state: 'confirmed', multiplier: 30 })], new Set());
    expect(svg).toContain('role="img"');
    expect(svg).toContain('1 confirmed above baseline');
  });

  it('renders nothing at all rather than an empty frame', () => {
    expect(stripSvg([], new Set())).toBe('');
  });
});

describe('retractions', () => {
  it('discloses withdrawn findings by count rather than hiding them', () => {
    const html = renderLens(lens({ withdrawn: 140 }), index(), meta(), COPY);
    expect(html).toContain('Withdrawn');
    expect(html).toContain('140 earlier findings have been');
    expect(html).toContain('remain in the');
  });

  it('says nothing when nothing was withdrawn', () => {
    expect(renderLens(lens(), index(), meta(), COPY)).not.toContain('Withdrawn');
  });
});

describe('telling one kind of claim from another', () => {
  it('states which comparison a finding rests on', () => {
    // fork-spike and fork-outlier are different claims resting on different
    // evidence and available at different times. Rendered identically, a reader
    // cannot tell whether 12x means twelve times this project's own history or
    // twelve times the rest of its category.
    const own = renderEventPage(event(), index(), meta());
    expect(own).toContain('own trailing baseline');

    const peer = renderEventPage(event({ kind: "fork-outlier" }), index(), meta());
    expect(peer).toContain('other repositories in its category');
  });

  it('marks a written sentence differently from an assembled one', () => {
    const written = renderEventPage(event({ summarySource: "model" }), index(), meta());
    const assembled = renderEventPage(event({ summarySource: "template" }), index(), meta());

    expect(written).toContain('Written from the readings above');
    expect(written).toContain('explains-written');
    expect(assembled).toContain('Assembled from the readings above');
    expect(assembled).toContain('explains-assembled');
  });

  it('says a bounded figure is bounded', () => {
    const capped = event({ metrics: { multiplier: 50, multiplierCapped: 'yes' } });
    const html = renderEventPage(capped, index(), meta());
    expect(html).toContain('a bound, not a measurement');
  });

  it('names measurements in words with their units', () => {
    const html = renderLens(lens({ records: [event()], count: 1 }), index(), meta(), COPY);
    expect(html).toContain('Forks added');
    expect(html).toContain('Measured over');
    expect(html).toContain('24 hours');
    // Not a variable name.
    expect(html).not.toContain('observation Hours');
    expect(html).not.toContain('forksAdded');
  });

  it('keeps caveats out of the measurement tiles', () => {
    // A caveat rendered as a tile makes a qualification look like a reading.
    const html = renderLens(
      lens({ records: [event({ metrics: { forksAdded: 60, scope: 'watchlist' } })], count: 1 }),
      index(),
      meta(),
      COPY,
    );
    expect(html).not.toContain('>scope<');
  });
});

describe('honesty of presentation', () => {
  it('sets generated prose in its own face, apart from the measurements', () => {
    // Asserted on the finding's own page rather than on the lens.
    //
    // A lens listing findings is a table now: /ships rendered 388 cards and ran
    // to 2,241 words with no table cell in it. The basis, the full readings and
    // the written sentence moved to /e/<slug>, which every row links to — so
    // the guarantee is unchanged and this had been pinned to where it was
    // rendered rather than to whether it is rendered.
    const html = renderEventPage(event(), index(), meta());
    expect(html).toContain('<p class="prose">');
    expect(html).toContain("24× this repository's 19-day baseline.");
  });

  it('never encodes a state in colour alone', () => {
    const html = renderLens(lens({ records: [event()], count: 1 }), index(), meta(), COPY);
    // The class carries the colour; the text carries the meaning.
    expect(html).toContain('state-confirmed');
    expect(html).toContain('>confirmed<');
  });

  it('links every claim to its evidence', () => {
    const html = renderLens(lens({ records: [event()], count: 1 }), index(), meta(), COPY);
    expect(html).toContain('href="https://github.com/a/one"');
  });

  it('discloses that the watchlist is curated and the data is not real-time', () => {
    const html = renderIndex(index(), meta());
    expect(html).toContain('curated and partial');
    expect(html).toContain('not real-time');
  });

  it('escapes third-party text, which is where the injection would come from', () => {
    // Tag names and repository names are chosen by people we do not control.
    const hostile = event({
      repo: 'evil/<script>alert(1)</script>',
      summary: '<img src=x onerror=alert(1)>',
      evidenceUrl: 'https://github.com/"onmouseover="alert(1)',
    });
    const html = renderLens(lens({ records: [hostile], count: 1 }), index(), meta(), COPY);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('"onmouseover="');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('telling a first-time visitor what this is', () => {
  it('states what the instrument does before showing any of it', () => {
    // A visitor used to land on a table of repository names with nothing to
    // say why. That is a product failure, not a matter of taste.
    const html = renderIndex(index(), meta());
    expect(html).toContain('An instrument pointed at');
    expect(html).toContain('400 open-source repositories');
    expect(html).toContain('Compared against its own history');
  });

  it('says what each reading answers, in the reader’s words', () => {
    // It asserted the phrase "five readings" until the token paragraph that
    // happened to carry it was rewritten. The phrase was wrong anyway — there
    // are eleven — and the test had been holding the mistake in place rather
    // than catching it. The questions are the real check: a reader learns what
    // this does from them, not from a count.
    const html = renderIndex(index(), meta());
    expect(html).toContain('What released a new version?');
    expect(html).toContain('Which models say they were built on which?');
  });

  it('puts the tools where a first-time visitor lands', () => {
    // The site had three tools and an MCP endpoint and mentioned none of them
    // above the fold. A tool nobody can find is a tool nobody has.
    const html = renderIndex(index(), meta());

    expect(html).toContain('Check your stack');
    expect(html).toContain('Compare two projects');
    expect(html).toContain('Wire it to your agent');
  });

  it('keeps the index to readings rather than explanations', () => {
    // 613 words of explanatory prose across 15 paragraphs, on a page whose job
    // is showing numbers. The caveats belong on /method, linked, not repeated
    // under every table.
    const html = renderIndex(index(), meta());
    const prose = [...html.matchAll(/<p class="(?:band-note|basis[^"]*|hero-sub)"[^>]*>([\s\S]*?)<\/p>/g)]
      .map((match) => (match[1] as string).replace(/<[^>]+>/g, ''))
      .join(' ');

    expect(prose.split(/\s+/).filter(Boolean).length).toBeLessThan(220);
  });

  it('names every band in the same rail, so the page has an order', () => {
    // The layout complaint was that nothing marked where one reading stopped
    // and the next began. Every section carries its name in the same rail, and
    // a missing one is a section a reader cannot place.
    const html = renderIndex(
      index({
        strip: [mark({ delta: 60, multiplier: 24, state: 'confirmed' })],
        adoption: {
          measured: 1,
          unread: 0,
          weekly: 800,
          weeklyPackages: 1,
          top: [{ repo: 'a/one', registry: 'npm', name: 'one', count: 800, window: 'week' }],
          lifetime: [],
        },
        health: {
          scored: 1,
          unscored: 0,
          median: 7,
          advisories: 2,
          weakest: [{ repo: 'a/one', scorecard: 7, scoredAt: '2026-08-01', advisories: 2 }],
        },
      }),
      meta(),
    );

    // Ordered by how much each band actually has to say. Installs is the only
    // one with no empty cell in it and it used to sit third, behind two bands
    // that were mostly em-dashes.
    for (const name of ['Installs', 'Ask', 'Watchlist', 'Today', 'Signals', 'Our record', 'The token']) {
      expect(html).toContain(`<h2 class="band-name">${name}</h2>`);
    }

    // Numbered 01–08 for a day. The brief bans sequential numbering on things
    // that are not a sequence, and nobody refers to "reading 04".
    expect(html).not.toContain('class="band-no ');
  });

  it('explains the token without claiming anything it must not', () => {
    const html = renderIndex(index(), meta());
    expect(html).toContain('The token');
    expect(html).toContain('funded by a token on Robinhood Chain');
    expect(html).toContain('Holding it does not unlock anything here');

    // Never price, never appreciation, never a wallet to connect. These are the
    // assertions that matter and they outlive any particular launch state.
    expect(html).not.toMatch(/\bprice\b/i);
    expect(html).not.toMatch(/\bappreciat/i);
    expect(html).not.toMatch(/connect (your )?wallet/i);
  });

  it('states the launch from the token record rather than from prose', () => {
    // It asserted the literal string "It has not launched", typed into two
    // pages. On the day the contract was deployed both would have gone on
    // saying it, and a test would have defended them. The sentence is derived
    // from src/lib/payment.ts now, and this checks that the page agrees with
    // whatever that file holds — before launch and after.
    const html = renderIndex(index(), meta());

    if (TOKEN === null) {
      expect(html).toContain('It has not launched');
      expect(html).not.toMatch(/0x[0-9a-fA-F]{40}/);
      return;
    }

    expect(html).toContain(TOKEN.address);
    expect(html).toContain('It launched');

    // A truncated address is worse than none: the middle characters are the
    // ones an impersonator changes.
    expect(html).not.toContain(`${TOKEN.address.slice(0, 6)}…`);

    // Whether the rail charges is a separate fact from whether the token
    // exists, and the page must not collapse them.
    if (!CHARGING) expect(html).toContain('not charging yet');
  });
});

describe('magnitude, drawn', () => {
  const withAdoption = () =>
    index({
      adoption: {
        measured: 3,
        unread: 0,
        weekly: 900,
        weeklyPackages: 2,
        top: [
          { repo: 'a/one', registry: 'npm', name: 'one', count: 800, window: 'week' },
          { repo: 'b/two', registry: 'pypi', name: 'two', count: 100, window: 'week' },
          { repo: 'c/three', registry: 'brew', name: 'three', count: 40, window: '30d' },
        ],
        lifetime: [],
      },
    });

  it('scales every bar against the largest reading and says what it is', () => {
    // A bar with no stated maximum is a shape, not a measurement.
    const html = renderIndex(withAdoption(), meta());

    expect(html).toContain('--share:100.0%');
    expect(html).toContain('--share:12.5%');
    expect(html).toContain('Bars against 800');
  });

  it('steps the shade with the same figure the length carries', () => {
    // Redundant on purpose: nothing here may depend on telling hues apart, and
    // five identity colours failed the all-pairs check on this surface.
    const html = renderIndex(withAdoption(), meta());

    expect(html).toContain('--step:var(--mag-5)');
    expect(html).toContain('--step:var(--mag-1)');
  });

  it('carries the final figure in the markup, not only in the animation', () => {
    // The count-up replaces this for a second. Without scripting the number is
    // simply correct, which is the only acceptable failure mode.
    const html = renderIndex(withAdoption(), meta());
    expect(html).toContain('data-count="900"');
    expect(html).toContain('>900<');
  });
});

describe('the method page', () => {
  it('states the limits as plainly as the readings', () => {
    const html = renderMethod(index(), meta());

    expect(html).toContain('It is not a survey');
    expect(html).toContain('never an endorsement');
    expect(html).toContain('co-occurrence, never a cause');
    expect(html).toContain('not real-time');
  });

  it('discloses the conflict of interest with a number', () => {
    // A fifth of the watchlist is the field the funding lives in. Disclosed
    // here because a reader should not have to find it themselves, and because
    // it is exactly what costs a project its credibility when someone else
    // finds it first.
    const html = renderMethod(
      index({
        watchlist: { total: 400, active: 400, byCategory: {} },
        archive: { measured: 0, from: null, to: null, rows: 0 },
        coverage: [
          { category: 'crypto-web3', repositories: 80, measured: 0, forksAdded: null, findings: 0, busiest: null },
        ],
      }),
      meta(),
    );

    expect(html).toContain('The conflict worth stating');
    expect(html).toContain('80 of the 400 repositories watched — 20%');
  });

  it('says how a reader can tell the instrument is broken', () => {
    const html = renderMethod(index(), meta());
    expect(html).toContain('never approached');
    expect(html).toContain('this instrument is set too high');
  });
});

describe('navigation', () => {
  it('marks lenses that are not collecting yet', () => {
    const html = renderIndex(index(), meta());
    expect(html).toContain('data-pending="true"');
    expect(html).toContain('aria-current="page"');
  });

  it('never links to a .html path', () => {
    // Pages serves ships.html at /ships and answers /ships.html with a 308.
    // Linking with the extension puts a redirect in front of every navigation.
    const pages = [
      renderIndex(index({ today: [event()], strip: [mark()] }), meta()),
      renderLens(lens({ records: [event()], count: 1 }), index(), meta(), COPY),
    ];

    for (const html of pages) {
      const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1] as string);
      expect(links.filter((href) => href.endsWith('.html'))).toEqual([]);
    }
  });

  it('marks the current lens without the extension', () => {
    const html = renderLens(lens(), index(), meta(), COPY);
    expect(html).toContain('href="/forks" aria-current="page"');
  });
});

describe('the chrome', () => {
  it('applies a stored theme before the first paint', () => {
    // Deferred, this repaints the page from dark to light in front of somebody
    // who chose light. A flash of the wrong theme on every navigation is worse
    // than not offering the choice, so it is the one inline script here.
    const html = renderIndex(index(), meta());
    const head = html.slice(0, html.indexOf('</head>'));

    expect(head).toContain("localStorage.getItem('readout-theme')");
    expect(head).toContain('document.documentElement.dataset.theme');
  });

  it('offers no theme switch until scripting can work it', () => {
    // A control that does nothing is worse than no control. Without scripting
    // the system preference still decides, through `color-scheme: light dark`.
    const html = renderIndex(index(), meta());

    expect(html).toContain('data-theme-switch');
    expect(/<button[^>]*data-theme-switch[^>]*\shidden/.test(html)).toBe(true);
  });

  it('names the switch for a reader who cannot see its position', () => {
    expect(renderIndex(index(), meta())).toContain('aria-label="Switch between the dark and light');
  });

  it('keeps navigation reachable from the foot of a four-hundred-row page', () => {
    const html = renderIndex(index(), meta());
    const chrome = html.slice(html.indexOf('<header class="chrome"'));

    // One sticky bar, wordmark and navigation together. Two static blocks meant
    // the only way to another signal was to scroll back to the top first.
    expect(chrome).toContain('class="shell chrome-bar"');
    expect(chrome.indexOf('class="nav shell"')).toBeGreaterThan(0);
    expect(chrome.indexOf('</header>')).toBeGreaterThan(chrome.indexOf('class="nav shell"'));
  });

  it('keeps the glass off every surface holding a number', () => {
    // The material is confined to the layer that floats. A number seen through
    // frosted glass is a number whose contrast nobody can state.
    const css = readFileSync(
      fileURLToPath(new URL('../src/site/site.css', import.meta.url)),
      'utf8',
    );

    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blurred = [...rules.matchAll(/([^{}]+)\{[^{}]*backdrop-filter:[^{}]*\}/g)].map((match) =>
      (match[1] as string).trim(),
    );

    expect(blurred.length).toBeGreaterThan(0);
    for (const selector of blurred) {
      expect(selector, `${selector} blurs what is behind it`).toMatch(/^\.chrome$/);
    }
  });
});
