import { describe, expect, it } from 'vitest';

import {
  apiUrl,
  collectIncidents,
  parseHeroku,
  parseStatuspage,
  PROVIDERS,
  type IncidentClient,
  type Provider,
} from '../src/collectors/incidents.ts';
import {
  allowedMinutes,
  mergedMinutes,
  summariseIncidents,
  WINDOW_DAYS,
} from '../src/lib/incidents-summary.ts';
import { incidentAt, incidentMinutes, type IncidentRow } from '../src/types/incidents.ts';

/**
 * Incident history read from other people's status pages.
 *
 * Two failures matter here and neither one throws. The first is a rolling
 * window: a read that returns nothing looks exactly like a provider with a
 * spotless quarter, and emptying the ledger on one of those deletes the only
 * copy of a record that no longer exists anywhere else.
 *
 * The second is the one that actually happened. This read `history.rss` and
 * stored each item's pubDate — the time of its *last update* — in a field named
 * `startedAt`. Every resolved row carried a resolution time and the site
 * published it as the incident date. The dates parsed, sorted and rendered
 * fine. So the tests below check which timestamp lands in which field, not that
 * a timestamp landed.
 */

const TODAY = '2026-08-07';

const WHOEVER: Provider = {
  slug: 'whoever',
  name: 'Whoever',
  host: 'https://status.test',
  kind: 'statuspage',
};

const ONE = [WHOEVER];

/** Statuspage's own shape, trimmed to the fields this reads. */
function incident(
  over: {
    id?: string;
    name?: string;
    status?: string;
    started_at?: string | null;
    created_at?: string;
    resolved_at?: string | null;
    updated_at?: string;
    impact?: string;
  } = {},
): Record<string, unknown> {
  return {
    id: over.id ?? 'abc123',
    name: over.name ?? 'Incident with Actions',
    status: over.status ?? 'resolved',
    impact: over.impact ?? 'minor',
    created_at: over.created_at ?? '2026-08-07T02:04:44.000Z',
    started_at: over.started_at === undefined ? '2026-08-07T02:04:44.000Z' : over.started_at,
    resolved_at: over.resolved_at === undefined ? '2026-08-07T02:30:44.000Z' : over.resolved_at,
    updated_at: over.updated_at ?? '2026-08-07T02:30:44.000Z',
  };
}

function payload(...incidents: Record<string, unknown>[]): unknown {
  return { page: { id: 'p1', name: 'Whoever' }, incidents };
}

function client(payloads: Record<string, unknown>, fail: string[] = []): IncidentClient {
  let spent = 0;
  return {
    requests: () => spent,
    async json(url) {
      spent += 1;
      if (fail.includes(url)) throw new Error('socket hang up');
      return payloads[url] ?? null;
    },
  };
}

function options(over: Partial<Parameters<typeof collectIncidents>[1]> = {}) {
  return { today: TODAY, delayMs: 0, providers: ONE, ...over };
}

function row(over: Partial<IncidentRow> = {}): IncidentRow {
  return {
    provider: 'whoever',
    id: 'https://status.test/incidents/abc123',
    title: 'Incident with Actions',
    startedAt: '2026-08-01T02:04:44.000Z',
    resolvedAt: '2026-08-01T02:30:44.000Z',
    updatedAt: '2026-08-01T02:30:44.000Z',
    impact: 'minor',
    resolved: true,
    url: 'https://status.test/incidents/abc123',
    ...over,
  };
}

describe('apiUrl', () => {
  it('asks Statuspage for JSON, not for the feed that lost the start time', () => {
    expect(apiUrl(WHOEVER)).toBe('https://status.test/api/v2/incidents.json');
  });

  it('asks Heroku through its own API, which is not Statuspage', () => {
    const heroku = PROVIDERS.find((provider) => provider.slug === 'heroku');
    expect(apiUrl(heroku as Provider)).toBe('https://status.heroku.com/api/v4/incidents');
  });

  it('gives every provider a host with no trailing slash', () => {
    // Two of these publish their own URL with one, which is how ids containing
    // `//incidents/` got into the ledger.
    for (const provider of PROVIDERS) expect(provider.host.endsWith('/')).toBe(false);
  });
});

describe('parseStatuspage', () => {
  it('keeps the start and the resolution apart', () => {
    const rows = parseStatuspage(payload(incident()), WHOEVER);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'whoever',
      title: 'Incident with Actions',
      startedAt: '2026-08-07T02:04:44.000Z',
      resolvedAt: '2026-08-07T02:30:44.000Z',
      resolved: true,
    });
  });

  it('never stores the resolution time as the start', () => {
    // The bug this file exists to prevent a second time.
    const rows = parseStatuspage(
      payload(
        incident({ started_at: '2026-07-22T08:34:31.874Z', resolved_at: '2026-07-22T09:00:25.206Z' }),
      ),
      WHOEVER,
    );

    expect(rows[0]?.startedAt).toBe('2026-07-22T08:34:31.874Z');
    expect(incidentMinutes(rows[0] as IncidentRow)).toBe(26);
  });

  it('falls back to created_at on the clones that publish no started_at', () => {
    // OpenAI and Groq run a Statuspage-compatible service without the field.
    // Their first incident update carries created_at exactly, so the record was
    // opened when it began.
    const rows = parseStatuspage(
      payload(incident({ started_at: null, created_at: '2026-08-05T14:55:59.000Z' })),
      WHOEVER,
    );

    expect(rows[0]?.startedAt).toBe('2026-08-05T14:55:59.000Z');
  });

  it('builds the id from the host, so a trailing slash cannot double it', () => {
    const rows = parseStatuspage(payload(incident({ id: 'xyz' })), WHOEVER);

    expect(rows[0]?.id).toBe('https://status.test/incidents/xyz');
    expect(rows[0]?.url).toBe('https://status.test/incidents/xyz');
  });

  it('records an open incident as unresolved rather than guessing', () => {
    const rows = parseStatuspage(
      payload(incident({ status: 'investigating', resolved_at: null })),
      WHOEVER,
    );

    expect(rows[0]?.resolved).toBe(false);
    expect(rows[0]?.resolvedAt).toBeNull();
  });

  it('reads a postmortem as resolved, because it is', () => {
    expect(parseStatuspage(payload(incident({ status: 'postmortem' })), WHOEVER)[0]?.resolved).toBe(
      true,
    );
  });

  it('skips a record with no usable timestamp instead of inventing one', () => {
    const undated = { id: 'nope', name: 'No dates', status: 'resolved' };
    expect(parseStatuspage(payload(undated, incident()), WHOEVER)).toHaveLength(1);
  });

  it('ignores a timestamp that does not parse', () => {
    const rows = parseStatuspage(payload(incident({ started_at: 'whenever' })), WHOEVER);
    // created_at is still good, so the row survives with the start it can prove.
    expect(rows[0]?.startedAt).toBe('2026-08-07T02:04:44.000Z');
  });

  it('returns nothing for a page that is not the API', () => {
    expect(parseStatuspage('<!DOCTYPE html><html></html>', WHOEVER)).toEqual([]);
    expect(parseStatuspage({ page: {} }, WHOEVER)).toEqual([]);
  });
});

describe('parseHeroku', () => {
  const heroku: Provider = {
    slug: 'heroku',
    name: 'Heroku',
    host: 'https://status.heroku.com',
    kind: 'heroku',
  };

  const record = {
    id: 2960,
    title: 'Heroku Retroactive Feature Degradation',
    state: 'resolved',
    created_at: '2026-08-06T16:17:48.126Z',
    updated_at: '2026-08-06T16:20:35.981Z',
    resolved: false,
    resolved_at: null,
    duration: 165146,
    full_url: 'https://status.heroku.com/incidents/2960',
  };

  it('reads its numeric id and its own incident URL', () => {
    const rows = parseHeroku([record], heroku);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      provider: 'heroku',
      id: 'https://status.heroku.com/incidents/2960',
      title: 'Heroku Retroactive Feature Degradation',
      startedAt: '2026-08-06T16:17:48.126Z',
    });
  });

  it('trusts state, not the resolved flag Heroku leaves false on resolved records', () => {
    expect(parseHeroku([record], heroku)[0]?.resolved).toBe(true);
    expect(parseHeroku([{ ...record, state: 'issue' }], heroku)[0]?.resolved).toBe(false);
  });

  it('leaves the end unpublished rather than deriving one from duration', () => {
    // Heroku's `duration` disagrees with its own timestamps by minutes to
    // hours. A length computed from it would be a made-up number.
    expect(parseHeroku([record], heroku)[0]?.resolvedAt).toBeNull();
    expect(incidentMinutes(parseHeroku([record], heroku)[0] as IncidentRow)).toBeNull();
  });

  it('takes the resolution when Heroku does publish one', () => {
    const closed = { ...record, resolved_at: '2026-08-06T16:30:00.000Z' };
    expect(parseHeroku([closed], heroku)[0]?.resolvedAt).toBe('2026-08-06T16:30:00.000Z');
  });
});

describe('collectIncidents', () => {
  const URL = 'https://status.test/api/v2/incidents.json';

  it('keeps an incident the provider has already dropped', async () => {
    // The entire reason the file exists. A status page carries fifty and
    // forgets the rest, so outliving that window is the only thing added here.
    const held = [row({ id: 'old', startedAt: '2026-06-01T00:00:00.000Z' })];
    const result = await collectIncidents(
      held,
      options({ client: client({ [URL]: payload(incident()) }) }),
    );

    expect(result.rows.map((entry) => entry.id).sort()).toEqual([
      'https://status.test/incidents/abc123',
      'old',
    ]);
  });

  it('updates an incident in place when its resolution lands later', async () => {
    const held = [row({ resolved: false, resolvedAt: null })];
    const result = await collectIncidents(
      held,
      options({ client: client({ [URL]: payload(incident()) }) }),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.resolved).toBe(true);
    expect(result.rows[0]?.resolvedAt).toBe('2026-08-07T02:30:44.000Z');
  });

  it('keeps what it has when a provider cannot be read', async () => {
    const held = [row()];
    const result = await collectIncidents(held, options({ client: client({}, [URL]) }));

    expect(result.rows).toEqual(held);
    expect(result.errors[0]).toContain('whoever');
  });

  it('keeps what it has when the API stops being the API', async () => {
    const held = [row()];
    const result = await collectIncidents(
      held,
      options({ client: client({ [URL]: { page: {} } }) }),
    );

    expect(result.rows).toEqual(held);
    expect(result.errors[0]).toContain('no incidents parsed');
  });

  it('drops rows past the retention window', async () => {
    const held = [
      row({ id: 'ancient', startedAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' }),
      row({ id: 'recent', startedAt: '2026-08-01T00:00:00.000Z' }),
    ];

    const result = await collectIncidents(
      held,
      options({ retainDays: 365, client: client({ [URL]: payload(incident()) }) }),
    );

    expect(result.rows.map((entry) => entry.id)).not.toContain('ancient');
    expect(result.rows.map((entry) => entry.id)).toContain('recent');
  });

  it('retains a row with no start by its last update', async () => {
    // The rows kept from the RSS era. They have one timestamp and it is not a
    // start; dropping them would delete history nobody else has.
    const held = [
      row({ id: 'legacy', startedAt: null, resolvedAt: null, updatedAt: '2026-08-01T00:00:00.000Z' }),
    ];
    const result = await collectIncidents(
      held,
      options({ retainDays: 365, client: client({ [URL]: payload(incident()) }) }),
    );

    expect(result.rows.map((entry) => entry.id)).toContain('legacy');
  });

  it('spends one request per provider', async () => {
    const c = client({});
    await collectIncidents([], options({ client: c, providers: PROVIDERS, delayMs: 0 }));
    expect(c.requests()).toBe(PROVIDERS.length);
  });
});

describe('mergedMinutes', () => {
  const at = (hour: number): number => Date.parse(`2026-08-06T${String(hour).padStart(2, '0')}:00:00Z`);

  it('adds intervals that do not touch', () => {
    expect(mergedMinutes([[at(0), at(1)], [at(4), at(5)]])).toBe(120);
  });

  it('counts overlapping intervals once', () => {
    expect(mergedMinutes([[at(0), at(2)], [at(1), at(3)]])).toBe(180);
  });

  it('counts a contained interval not at all', () => {
    expect(mergedMinutes([[at(0), at(4)], [at(1), at(2)]])).toBe(240);
  });

  it('joins intervals that meet exactly', () => {
    expect(mergedMinutes([[at(0), at(1)], [at(1), at(2)]])).toBe(120);
  });

  it('is empty for no intervals, and ignores one that ends before it starts', () => {
    expect(mergedMinutes([])).toBe(0);
    expect(mergedMinutes([[at(4), at(1)]])).toBe(0);
  });
});

describe('allowedMinutes', () => {
  it('states what the targets people quote actually allow over the window', () => {
    // Arithmetic, shown for scale. Not a bar anybody on the page is measured
    // against — see the wording beside it.
    expect(allowedMinutes(99.9)).toBe(130);
    expect(allowedMinutes(99.99)).toBe(13);
    expect(allowedMinutes(99.9, 30)).toBe(43);
  });
});

describe('incidentAt', () => {
  it('prefers the published start', () => {
    expect(incidentAt(row())).toBe('2026-08-01T02:04:44.000Z');
  });

  it('falls back to the last update when there is no start', () => {
    expect(incidentAt(row({ startedAt: null }))).toBe('2026-08-01T02:30:44.000Z');
  });

  it('refuses to date a row with nothing usable', () => {
    expect(incidentAt(row({ startedAt: null, updatedAt: 'whenever' }))).toBeNull();
  });
});

describe('summariseIncidents', () => {
  it('counts inside the window and names every tracked provider', () => {
    const summary = summariseIncidents(
      [
        row({ provider: 'github', startedAt: '2026-08-06T00:00:00.000Z', id: 'a' }),
        row({ provider: 'github', startedAt: '2026-08-05T00:00:00.000Z', id: 'b' }),
        row({ provider: 'npm', startedAt: '2026-08-04T00:00:00.000Z', id: 'c' }),
        // Outside the window.
        row({ provider: 'npm', startedAt: '2025-01-01T00:00:00.000Z', id: 'd' }),
      ],
      TODAY,
    );

    expect(summary.total).toBe(3);
    expect(summary.windowDays).toBe(WINDOW_DAYS);
    expect(summary.providers).toBe(PROVIDERS.length);
    // Quiet providers are listed at zero rather than omitted. An absent row
    // reads as "not watched", which is a different claim from "nothing filed".
    expect(summary.byProvider).toHaveLength(PROVIDERS.length);
    expect(summary.byProvider[0]).toMatchObject({ slug: 'github', count: 2 });
  });

  it('orders by count, busiest first', () => {
    const summary = summariseIncidents(
      [
        row({ provider: 'npm', id: 'a', startedAt: '2026-08-06T00:00:00.000Z' }),
        row({ provider: 'npm', id: 'b', startedAt: '2026-08-06T00:00:00.000Z' }),
        row({ provider: 'npm', id: 'c', startedAt: '2026-08-06T00:00:00.000Z' }),
        row({ provider: 'github', id: 'd', startedAt: '2026-08-06T00:00:00.000Z' }),
      ],
      TODAY,
    );

    expect(summary.byProvider[0]?.slug).toBe('npm');
    expect(summary.byProvider[1]?.slug).toBe('github');
  });

  it('reports how far back the record actually goes', () => {
    // Stops the page implying a longer history than has been kept.
    const summary = summariseIncidents(
      [row({ provider: 'github', startedAt: '2026-07-08T00:00:00.000Z' })],
      TODAY,
    );

    expect(summary.observedDays).toBe(30);
  });

  it('measures length only where both ends were published', () => {
    const summary = summariseIncidents(
      [
        row({ provider: 'github', id: 'a', startedAt: '2026-08-06T00:00:00.000Z', resolvedAt: '2026-08-06T01:00:00.000Z' }),
        row({ provider: 'github', id: 'b', startedAt: '2026-08-06T00:00:00.000Z', resolvedAt: '2026-08-06T00:30:00.000Z' }),
        // Open: no end published, so no length.
        row({ provider: 'github', id: 'c', startedAt: '2026-08-06T00:00:00.000Z', resolvedAt: null, resolved: false }),
        // Kept from the RSS era: no start, so no length.
        row({ provider: 'github', id: 'd', startedAt: null, updatedAt: '2026-08-06T00:00:00.000Z' }),
      ],
      TODAY,
    );

    expect(summary.total).toBe(4);
    expect(summary.timed).toBe(2);
    expect(summary.medianMinutes).toBe(60);
    expect(summary.byProvider[0]).toMatchObject({ slug: 'github', timed: 2, medianMinutes: 60 });
  });

  it('counts a row with no status apart from one marked unresolved', () => {
    // The RSS reader looked for a `Resolved` marker in the item description and
    // missed it on every OpenAI incident. Reading those rows as unresolved
    // would publish sixty-six outages OpenAI never closed, out of a parser bug.
    const summary = summariseIncidents(
      [
        row({ provider: 'github', id: 'a', startedAt: '2026-08-06T00:00:00.000Z', resolved: true }),
        row({ provider: 'github', id: 'b', startedAt: '2026-08-06T00:00:00.000Z', resolved: false }),
        row({ provider: 'github', id: 'c', startedAt: null, updatedAt: '2026-08-06T00:00:00.000Z', resolved: null }),
      ],
      TODAY,
    );

    expect(summary.byProvider[0]).toMatchObject({
      slug: 'github',
      count: 3,
      resolved: 1,
      withStatus: 2,
    });
  });

  it('merges overlapping incidents instead of adding them up', () => {
    // Three records for one bad afternoon is one bad afternoon. Adding the
    // durations instead invented two days of one real provider's quarter.
    const summary = summariseIncidents(
      [
        row({ provider: 'github', id: 'a', startedAt: '2026-08-06T00:00:00.000Z', resolvedAt: '2026-08-06T02:00:00.000Z' }),
        row({ provider: 'github', id: 'b', startedAt: '2026-08-06T01:00:00.000Z', resolvedAt: '2026-08-06T03:00:00.000Z' }),
        // Wholly inside the first, and must add nothing at all.
        row({ provider: 'github', id: 'c', startedAt: '2026-08-06T00:30:00.000Z', resolvedAt: '2026-08-06T01:00:00.000Z' }),
        // Separate afternoon, so it does add.
        row({ provider: 'github', id: 'd', startedAt: '2026-08-07T00:00:00.000Z', resolvedAt: '2026-08-07T01:00:00.000Z' }),
      ],
      TODAY,
    );

    // 00:00–03:00 is three hours, plus one the next day. Summed it would be six.
    expect(summary.byProvider[0]?.openMinutes).toBe(240);
  });

  it('counts the grading the provider gave, and only that', () => {
    const summary = summariseIncidents(
      [
        row({ provider: 'github', id: 'a', impact: 'critical', startedAt: '2026-08-06T00:00:00.000Z', resolvedAt: '2026-08-06T01:00:00.000Z' }),
        row({ provider: 'github', id: 'b', impact: 'minor', startedAt: '2026-08-06T04:00:00.000Z', resolvedAt: '2026-08-06T06:00:00.000Z' }),
        // Ungraded: not counted as serious, and not counted as minor either.
        row({ provider: 'github', id: 'c', impact: null, startedAt: '2026-08-06T08:00:00.000Z', resolvedAt: '2026-08-06T09:00:00.000Z' }),
      ],
      TODAY,
    );

    expect(summary.byProvider[0]).toMatchObject({
      openMinutes: 240,
      seriousMinutes: 60,
      graded: 2,
    });
  });

  it('reports no open time for a provider whose incidents were never timed', () => {
    // Rows kept from the RSS era have one timestamp. A zero here would read as
    // a spotless quarter; the page shows a dash because `timed` is zero.
    const summary = summariseIncidents(
      [row({ provider: 'github', startedAt: null, resolvedAt: null, updatedAt: '2026-08-06T00:00:00.000Z' })],
      TODAY,
    );

    expect(summary.byProvider[0]).toMatchObject({ count: 1, timed: 0, openMinutes: 0 });
  });

  it('says when the date it shows is a last update rather than a start', () => {
    const summary = summariseIncidents(
      [
        row({ provider: 'github', id: 'a', startedAt: '2026-08-06T00:00:00.000Z' }),
        row({ provider: 'npm', id: 'b', startedAt: null, updatedAt: '2026-08-05T00:00:00.000Z' }),
      ],
      TODAY,
    );

    expect(summary.recent.map((entry) => entry.atKind)).toEqual(['started', 'updated']);
    expect(summary.recent[1]?.at).toBe('2026-08-05T00:00:00.000Z');
  });

  it('leaves an undatable row out of the window rather than dating it today', () => {
    const summary = summariseIncidents(
      [row({ provider: 'github', startedAt: null, updatedAt: 'whenever' })],
      TODAY,
    );

    expect(summary.total).toBe(0);
    expect(summary.observedDays).toBe(0);
  });

  it('reads an empty ledger as empty rather than throwing', () => {
    const summary = summariseIncidents([], TODAY);

    expect(summary.total).toBe(0);
    expect(summary.timed).toBe(0);
    expect(summary.medianMinutes).toBeNull();
    expect(summary.observedDays).toBe(0);
    expect(summary.recent).toEqual([]);
    expect(summary.byProvider.every((entry) => entry.count === 0)).toBe(true);
  });
});
