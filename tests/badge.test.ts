import { describe, expect, it } from 'vitest';

import { renderBadge } from '../src/site/badge.ts';

/**
 * The one artefact here that is read entirely out of context.
 *
 * A badge appears on somebody else's README, with no caveat beside it and no
 * disclosure to click through to. Whatever it says has to be true standing
 * alone, which makes its four words load-bearing in a way nothing else on the
 * site is — and it had no test at all until the day a second kind of download
 * count arrived.
 */

const health = (scorecard: number | null) =>
  scorecard === null
    ? undefined
    : {
        id: 'a/one',
        scorecard,
        scoredAt: '2026-08-01',
        advisories: 0,
        checks: [],
        observedAt: '2026-08-09T00:00:00Z',
      };

describe('the figure a badge shows', () => {
  it('names the window the count actually covers', () => {
    // RubyGems, Packagist and NuGet publish no rolling figure — only a running
    // total since the package first shipped. `installs/wk` on one of those puts
    // a ten-year number on a weekly badge, in a thousand READMEs, with nothing
    // around it to correct the reading.
    const lifetime = renderBadge({
      repo: 'rails/rails',
      packageName: 'rails',
      health: undefined,
      installs: 700_000_000,
      window: 'total',
    });

    expect(lifetime).toContain('installs, total');
    expect(lifetime).not.toContain('installs/wk');
  });

  it('still says per week for the registries that report a week', () => {
    for (const window of ['week', '30d', '90d'] as const) {
      const svg = renderBadge({
        repo: 'a/one',
        health: undefined,
        installs: 58_000_000,
        window,
      });
      expect(svg).toContain(window === 'week' ? 'installs/wk' : `installs/${window}`);
    }
  });

  it('treats an unstated window as a week, which is what a repository badge is', () => {
    // `adoptionByRepo` is npm and PyPI only and both report a rolling week, so
    // the default is the truth for every badge that omits it.
    expect(renderBadge({ repo: 'a/one', health: undefined, installs: 2_000_000 })).toContain(
      'installs/wk',
    );
  });

  it('falls back to the scorecard, then to saying only that it is watched', () => {
    expect(renderBadge({ repo: 'a/one', health: health(7.4), installs: null })).toContain(
      '7.4/10',
    );
    // Nothing measurable yet. Saying so is a true statement; inventing a figure
    // to fill the badge would not be.
    const nothing = renderBadge({ repo: 'a/one', health: undefined, installs: null });
    expect(nothing).toContain('watched');
    expect(nothing).not.toContain('installs');
  });

  it('never renders a zero as a reading', () => {
    // Zero downloads and no reading are different facts, and a badge saying
    // "0k installs/wk" states the wrong one about somebody's work.
    const svg = renderBadge({ repo: 'a/one', health: health(6), installs: 0 });
    expect(svg).toContain('6.0/10');
    expect(svg).not.toContain('installs');
  });

  it('escapes the name it is given rather than trusting the registry', () => {
    const svg = renderBadge({
      repo: 'a/one',
      packageName: 'x"><script>alert(1)</script>',
      health: undefined,
      installs: null,
    });

    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('makes no judgement anywhere in it', () => {
    // The whole design constraint in one assertion: it says what was measured,
    // never whether that is good.
    const svg = renderBadge({ repo: 'a/one', health: health(2.1), installs: null });
    for (const word of ['safe', 'unsafe', 'risky', 'healthy', 'unhealthy', 'recommended']) {
      expect(svg.toLowerCase()).not.toContain(word);
    }
  });
});
