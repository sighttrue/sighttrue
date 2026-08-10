import { describe, expect, it, vi } from 'vitest';

// @ts-expect-error — plain ESM with no types, which is the point of it.
import { MAX_LOOKUPS, READABLE, readMissing, readPackage } from '../cli/lib/registry.mjs';
// @ts-expect-error — same.
import { noticesFor } from '../cli/lib/notices.mjs';

/**
 * Reading a registry directly, for the packages the index does not hold.
 *
 * The index carries 186 packages. Measured against the projects this watches,
 * 3% of their dependencies had a reading and more than half the projects got
 * nothing at all — so the checker answered "nothing on record" to most of what
 * it was shown.
 *
 * Tested offline. These readers exist to be pointed at somebody else's service,
 * and a test suite that depends on npm being up is a test suite that fails for
 * reasons that have nothing to do with the code.
 */

const read = readPackage as (registry: string, name: string) => Promise<Record<string, unknown> | null>;
const many = readMissing as (
  wanted: { registry: string; name: string }[],
) => Promise<{ readings: Map<string, unknown>; skipped: number }>;

function reply(body: unknown) {
  return { ok: true, json: async () => body } as unknown as Response;
}

describe('which registries can be read without a key', () => {
  it('names the six that answer, and not the two that cannot', () => {
    expect([...READABLE].sort()).toEqual(['crates', 'gem', 'npm', 'nuget', 'packagist', 'pypi']);
    // Homebrew publishes no release date of its own and Maven Central publishes
    // no download count; neither can answer the question this asks.
    expect(READABLE).not.toContain('brew');
    expect(READABLE).not.toContain('maven');
  });

  it('returns nothing for a registry it does not know, rather than guessing', async () => {
    expect(await read('hex', 'phoenix')).toBeNull();
  });
});

describe('what a live reading is, and is not', () => {
  it('marks itself live, so a caller cannot report it as archived', async () => {
    // The whole claim of this project is that every figure is a file somebody
    // can check. A reading taken from the registry a moment ago is not in a
    // file, did not pass the carry-forward rules, and cannot be checked again
    // tomorrow. It has to arrive labelled.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({
          'dist-tags': { latest: '2.88.2' },
          time: { '2.88.2': '2020-02-11T00:00:00Z' },
          versions: { '2.88.2': { deprecated: 'request has been deprecated' } },
        }),
      ),
    );

    const reading = await read('npm', 'request');
    expect(reading?.['live']).toBe(true);
    expect(reading?.['withdrawn']).toContain('deprecated');
    expect(reading?.['lastPublish']).toBe('2020-02-11');
    vi.unstubAllGlobals();
  });

  it('leaves every GitHub-derived field null rather than inventing one', async () => {
    // Bus factor, scorecard and advisory counts need a token. Asking a stranger
    // for theirs to run a dependency check would be a worse trade than the gap
    // it closes, so these stay absent and say so.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({ 'dist-tags': { latest: '1.0.0' }, time: { '1.0.0': '2026-01-01T00:00:00Z' }, versions: { '1.0.0': {} } }),
      ),
    );

    const reading = await read('npm', 'anything');
    for (const field of ['repo', 'scorecard', 'advisories', 'busFactor', 'installs', 'pushedAt']) {
      expect(reading?.[field], field).toBeNull();
    }
    expect(reading?.['archived']).toBe(false);
    vi.unstubAllGlobals();
  });

  it('produces the same sentences the ledger readings do', async () => {
    // Same shape in, same `noticesFor` out. Two paths to a reading must not
    // become two vocabularies for describing one.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({
          'dist-tags': { latest: '1.3.0' },
          time: { '1.3.0': '2018-04-09T00:00:00Z' },
          versions: { '1.3.0': { deprecated: 'use String.prototype.padStart()' } },
        }),
      ),
    );

    const reading = await read('npm', 'left-pad');
    const notices = noticesFor('npm', 'left-pad', reading, '2026-08-10') as {
      kind: string;
      source: string;
    }[];

    expect(notices.map((n) => n.kind)).toContain('withdrawn');
    expect(notices[0]?.source).toBe('https://www.npmjs.com/package/left-pad');
    vi.unstubAllGlobals();
  });

  it('says nothing when the registry has never heard of the name', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false }) as Response));
    expect(await read('npm', 'not-a-real-package-xyz')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('treats an unreachable registry as no reading, never as a clean one', async () => {
    // A network failure must not read as "nothing wrong with this package".
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await read('npm', 'axios')).toBeNull();
    vi.unstubAllGlobals();
  });
});

describe('how many it will look up', () => {
  it('stops at the cap and reports what it skipped', async () => {
    // A manifest can be a directory, and these services owe this project
    // nothing. Silently truncating would overstate coverage; the count is
    // returned so the caller can say so.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply({ 'dist-tags': { latest: '1.0.0' }, time: { '1.0.0': '2026-01-01T00:00:00Z' }, versions: { '1.0.0': {} } }),
      ),
    );

    const wanted = Array.from({ length: MAX_LOOKUPS + 7 }, (_, i) => ({
      registry: 'npm',
      name: `package-${i}`,
    }));
    const { readings, skipped } = await many(wanted);

    expect(readings.size).toBe(MAX_LOOKUPS);
    expect(skipped).toBe(7);
    vi.unstubAllGlobals();
  });
});
