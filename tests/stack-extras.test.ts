import { describe, expect, it } from 'vitest';

import { STACK_EXTRAS_SCRIPT } from '../src/site/stack-extras.ts';

/**
 * Two artefacts a pasted manifest can produce, tested by running the code that
 * ships rather than a copy of it.
 *
 * The dangerous failure in both is the same and it is not a crash: claiming
 * something about a stack that is not in the manifest. A calendar entry for a
 * runtime somebody does not run, or an outage attributed to a provider they
 * have never used, is worse than no answer — it is a wrong answer wearing a
 * date and a source link.
 */

const build = new Function(
  `${STACK_EXTRAS_SCRIPT}; return { sighttrueEolFor, sighttrueIcs, sighttrueProviders };`,
)() as {
  sighttrueEolFor: (
    names: string[],
    engines: Record<string, string>,
    products: unknown[],
  ) => { product: string; cycle: string; eol: string; because: string }[];
  sighttrueIcs: (entries: unknown[], options?: Record<string, unknown>) => string;
  sighttrueProviders: (
    names: string[],
    incidents: unknown[],
    options?: Record<string, unknown>,
  ) => {
    provider: string;
    because: string[];
    incidents: number;
    timed: number;
    medianMinutes: number | null;
    latest: { title: string } | null;
  }[];
};

const PRODUCTS = [
  { product: 'django', cycle: '5.1', eol: '2026-12-01', ended: false },
  { product: 'django', cycle: '4.2', eol: '2026-04-01', ended: true },
  { product: 'nodejs', cycle: '22', eol: '2027-04-30', ended: false },
  { product: 'rails', cycle: '7.2', eol: '2026-08-09', ended: false },
  { product: 'python', cycle: '3.13', eol: '2029-10-31', ended: false },
];

describe('which end-of-life dates apply to a stack', () => {
  it('matches a dependency that is itself a tracked product', () => {
    const found = build.sighttrueEolFor(['django', 'requests'], {}, PRODUCTS);

    expect(found.map((entry) => entry.product)).toEqual(['django']);
    expect(found[0]?.because).toBe('django');
  });

  it('reads a runtime the manifest declares outright', () => {
    const found = build.sighttrueEolFor([], { node: '>=22' }, PRODUCTS);

    expect(found[0]?.product).toBe('nodejs');
    expect(found[0]?.because).toContain('engines.node');
  });

  it('never puts a cycle that has already ended on a calendar', () => {
    // A date in the past is not a deadline, and a reminder for one is noise
    // that teaches people to ignore the calendar.
    const found = build.sighttrueEolFor(['django'], {}, PRODUCTS);
    expect(found.every((entry) => entry.cycle !== '4.2')).toBe(true);
  });

  it('infers nothing from a library that merely talks to a product', () => {
    // `pg` is the Postgres client and `psycopg2` is too, so those are listed
    // by name. Nothing here decides you run Kubernetes because you depend on a
    // YAML parser.
    expect(build.sighttrueEolFor(['express', 'lodash', 'axios'], {}, PRODUCTS)).toEqual([]);
  });

  it('puts the nearest deadline first', () => {
    const found = build.sighttrueEolFor(['django', 'rails'], {}, PRODUCTS);
    expect(found.map((entry) => entry.eol)).toEqual(['2026-08-09', '2026-12-01']);
  });
});

describe('the calendar file', () => {
  const entries = [
    { product: 'django', cycle: '5.1', eol: '2026-12-01', because: 'django' },
  ];

  it('is a calendar a reader can subscribe to', () => {
    const ics = build.sighttrueIcs(entries, { now: '2026-08-09T00:00:00.000Z' });

    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    // RFC 5545 requires CRLF, and a calendar with bare newlines is rejected
    // by exactly the clients somebody would subscribe with.
    expect(ics).toContain('\r\n');
  });

  it('says where the date came from, inside the event', () => {
    // Read six months from now, in a calendar app, with no way back to here.
    const ics = build.sighttrueIcs(entries);

    expect(ics).toContain('endoflife.date');
    expect(ics).toContain('republished unchanged');
    expect(ics).toContain('In your stack because of django');
  });

  it('escapes the characters the format reserves', () => {
    const ics = build.sighttrueIcs([
      { product: 'a;b,c', cycle: '1', eol: '2026-12-01', because: 'x' },
    ]);
    expect(ics).toContain('a\\;b\\,c');
  });
});

describe('which providers a manifest reveals', () => {
  const incidents = [
    {
      provider: 'supabase',
      title: 'Project upgrade delays',
      startedAt: '2026-08-01T00:00:00.000Z',
      resolvedAt: '2026-08-01T02:00:00.000Z',
      url: 'https://status.supabase.com/incidents/a',
    },
    {
      provider: 'supabase',
      title: 'Older one',
      startedAt: '2026-07-20T00:00:00.000Z',
      resolvedAt: '2026-07-20T01:00:00.000Z',
      url: 'https://status.supabase.com/incidents/b',
    },
    {
      provider: 'github',
      title: 'Actions delays',
      startedAt: '2026-08-02T00:00:00.000Z',
      resolvedAt: null,
      url: 'https://www.githubstatus.com/incidents/c',
    },
  ];

  const NOW = { now: '2026-08-09T00:00:00.000Z' };

  it('reads a first-party client as evidence the service is used', () => {
    const found = build.sighttrueProviders(['@supabase/supabase-js', 'react'], incidents, NOW);

    expect(found.map((row) => row.provider)).toEqual(['supabase']);
    expect(found[0]?.because).toEqual(['@supabase/supabase-js']);
    expect(found[0]?.incidents).toBe(2);
  });

  it('claims nothing from a package that is not an official client', () => {
    // Being wrong here puts somebody else's outage on your report.
    expect(build.sighttrueProviders(['express', 'lodash'], incidents, NOW)).toEqual([]);
  });

  it('measures length only where both ends were published', () => {
    const found = build.sighttrueProviders(['@octokit/rest'], incidents, NOW);

    expect(found[0]?.incidents).toBe(1);
    expect(found[0]?.timed).toBe(0);
    expect(found[0]?.medianMinutes).toBeNull();
  });

  it('reports the median announced length where they were', () => {
    const found = build.sighttrueProviders(['@supabase/supabase-js'], incidents, NOW);
    expect(found[0]?.medianMinutes).toBe(120);
  });

  it('counts only inside the window it names', () => {
    const found = build.sighttrueProviders(['@supabase/supabase-js'], incidents, {
      ...NOW,
      windowDays: 10,
    });
    expect(found[0]?.incidents).toBe(1);
  });

  it('names the newest incident, not whichever came first in the file', () => {
    const found = build.sighttrueProviders(['@supabase/supabase-js'], incidents, NOW);
    expect(found[0]?.latest?.title).toBe('Project upgrade delays');
  });
});
