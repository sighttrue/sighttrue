import { describe, expect, it } from 'vitest';

import { daysBetween, elapsed } from '../src/site/package.ts';

/**
 * How long ago, in the words a reader would use.
 *
 * This is the figure on these pages most likely to be checked, because checking
 * it costs one click to GitHub. So it has to agree with what the other tab
 * says, and it did not: the count ran from midnight today back to the exact
 * instant of the push and rounded, so a push at 20:03 on the 7th came out as
 * 1.16 days on the 9th and rendered as "yesterday" — beside a GitHub page
 * reading 7 August.
 *
 * A post was about to be sent quoting that word.
 */

describe('counting the days', () => {
  it('counts on the calendar, not on the clock', () => {
    // The case that was wrong. Any hour of the 7th is two days before the 9th.
    expect(daysBetween('2026-08-07T20:03:02Z', '2026-08-09')).toBe(2);
    expect(daysBetween('2026-08-07T01:00:00Z', '2026-08-09')).toBe(2);
    expect(daysBetween('2026-08-07T23:59:59Z', '2026-08-09')).toBe(2);
  });

  it('gives a timestamp and a bare date the same answer', () => {
    // A publish date arrives as `2025-01-08` and a push as a full timestamp.
    // They were counted differently, so the same day meant two things on one
    // page depending on which field it came from.
    expect(daysBetween('2026-08-08', '2026-08-09')).toBe(1);
    expect(daysBetween('2026-08-08T18:30:00Z', '2026-08-09')).toBe(1);
  });

  it('still calls the day itself today', () => {
    expect(daysBetween('2026-08-09T00:01:00Z', '2026-08-09')).toBe(0);
    expect(daysBetween('2026-08-09T23:59:00Z', '2026-08-09')).toBe(0);
  });

  it('refuses a date it cannot read rather than guessing at one', () => {
    expect(daysBetween('not a date', '2026-08-09')).toBeNull();
  });
});

describe('saying it in words', () => {
  it('uses the words a person would use', () => {
    expect(elapsed(0)).toBe('today');
    expect(elapsed(1)).toBe('yesterday');
    expect(elapsed(2)).toBe('2 days ago');
  });

  it('never says today about something in the future', () => {
    // A registry timestamp ahead of the build date is a clock disagreement,
    // not a publish that has not happened. "Today" is the safe reading of it.
    expect(elapsed(-3)).toBe('today');
  });

  it('coarsens as the answer gets older, because the precision is not real', () => {
    expect(elapsed(59)).toBe('59 days ago');
    expect(elapsed(578)).toBe('19 months ago');
    expect(elapsed(900)).toBe('2.5 years ago');
  });
});
