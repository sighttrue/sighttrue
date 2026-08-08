import { describe, expect, it } from 'vitest';

import { collectLicences } from '../src/collectors/licences.ts';
import { templatedSentence } from '../src/lib/validate.ts';
import type { LiveStateRow } from '../src/types/state.ts';

/**
 * The detector that needs no threshold: a field either changed between two
 * readings or it did not, which is why it is worth having even though it fires
 * rarely.
 *
 * It was described here as one that "cannot produce a false positive" and it
 * produced 341, all the same shape — a repository appearing to relicense from
 * unidentified to whatever it had always been. The comparison was never the
 * problem. What was comparable was: a row written before the field existed
 * stores null, and null was read as a licence GitHub could not identify rather
 * than as one nobody had looked up. Both ends must now be a named licence.
 */

const OPTIONS = { now: '2026-08-06T04:17:00.000Z', today: '2026-08-06', seen: new Set<string>() };

function row(over: Partial<LiveStateRow> = {}): LiveStateRow {
  return {
    id: 'a/one',
    fullName: 'a/one',
    active: true,
    forks: 100,
    stars: 1000,
    openIssues: 10,
    language: 'Go',
    pushedAt: null,
    license: 'MIT',
    archived: false,
    latestReleaseTag: null,
    latestReleaseAt: null,
    etag: null,
    releaseEtag: null,
    ...over,
  };
}

function before(over: Partial<LiveStateRow> = {}): Map<string, LiveStateRow> {
  return new Map([['a/one', row(over)]]);
}

describe('relicensing', () => {
  it('reports the move and both ends of it', () => {
    const events = collectLicences([row({ license: 'BUSL-1.1' })], before(), OPTIONS);

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe('licence');
    expect(events[0]?.metrics['from']).toBe('MIT');
    expect(events[0]?.metrics['to']).toBe('BUSL-1.1');
  });

  it('is confirmed on sight', () => {
    // Two-run confirmation exists for counts that can be manufactured. A field
    // that changed cannot become more true on a second reading.
    expect(collectLicences([row({ license: 'BUSL-1.1' })], before(), OPTIONS)[0]?.confidence).toBe(
      'confirmed',
    );
  });

  it('says nothing when the licence held', () => {
    expect(collectLicences([row()], before(), OPTIONS)).toHaveLength(0);
  });

  it('says nothing when the previous row predates the field', () => {
    // The failure this actually produced. `license` was added to the schema
    // after 400 state rows existed, `conform` fills a missing key with
    // undefined, and comparing against that published 207 licence changes in
    // one run — every repository appearing to relicense from "unidentified" to
    // whatever it had always been. All 207 were retracted.
    //
    // undefined is never-recorded and not comparable. null is recorded, and
    // means GitHub could not identify one.
    const legacy = new Map([['a/one', { ...row(), license: undefined as unknown as null }]]);
    expect(collectLicences([row({ license: 'Apache-2.0' })], legacy, OPTIONS)).toHaveLength(0);
  });

  it('says nothing about a move away from an unidentified licence', () => {
    // It said something for a while, and it was wrong 341 times: "changed its
    // licence from unidentified to MIT" is this project learning a licence, not
    // a project changing one. A row written before the field existed stores
    // null, which is indistinguishable from a genuine absence — 89 rows in the
    // live ledger are in exactly that state, each one a false finding waiting
    // for its ETag to move.
    expect(collectLicences([row({ license: 'MIT' })], before({ license: null }), OPTIONS)).toEqual(
      [],
    );
  });

  it('says nothing on a first reading', () => {
    // Otherwise every licence on the watchlist is announced as news on the day
    // the field was added.
    expect(collectLicences([row()], new Map(), OPTIONS)).toHaveLength(0);
  });

  it('says nothing when a licence becomes unreadable', () => {
    // GitHub returns NOASSERTION for a licence file it cannot parse, which the
    // base collector stores as null. A project whose licence file moved is not
    // a project that relicensed, and the two are indistinguishable from here.
    expect(collectLicences([row({ license: null })], before(), OPTIONS)).toEqual([]);
  });

  it('reports nothing twice for the same day', () => {
    const first = collectLicences([row({ license: 'BUSL-1.1' })], before(), OPTIONS);
    const again = collectLicences([row({ license: 'BUSL-1.1' })], before(), {
      ...OPTIONS,
      seen: new Set([first[0]?.id as string]),
    });
    expect(again).toHaveLength(0);
  });
});

describe('archival', () => {
  it('reports a repository going read-only', () => {
    const events = collectLicences([row({ archived: true })], before(), OPTIONS);
    expect(events.map((event) => event.kind)).toContain('archived');
  });

  it('does not report it again once it is already archived', () => {
    const events = collectLicences([row({ archived: true })], before({ archived: true }), OPTIONS);
    expect(events).toHaveLength(0);
  });
});

describe('the sentence', () => {
  it('states the whole fact from the record, with no model involved', () => {
    const event = collectLicences([row({ license: 'BUSL-1.1' })], before(), OPTIONS)[0];
    expect(templatedSentence(event as never)).toBe(
      'a/one changed its licence from MIT to BUSL-1.1.',
    );
    expect(event?.summaryState).toBe('skipped');
  });
});
