import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'signal-archive-'));
process.env['SIGNAL_DATA_DIR'] = dataDir;

const ledger = await import('../src/lib/ledger.ts');

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env['SIGNAL_DATA_DIR'];
});

beforeEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

/**
 * The two series that were being deleted.
 *
 * Model prices and download counts live inline on their row as a 35-day trend
 * and are cut on every run; `history/` carries forks, stars and open issues and
 * nothing else. So "what did this model cost three months ago" had no answer
 * and was never going to get one — not because collection had not started, but
 * because the collector threw the answer away every day.
 *
 * These files are append-only. What is tested here is that they stay that way
 * under the two things that actually happen: a price that does not move, and a
 * daily job that runs twice.
 */

describe('the price archive', () => {
  const row = (id: string, prompt: number, at = '2026-08-09T02:17:00.000Z') => ({
    id,
    at,
    prompt,
    completion: prompt * 2,
    context: 200_000,
  });

  it('keeps what was written and returns it by month', () => {
    ledger.appendPrices('2026-08', [row('anthropic/opus', 5)]);
    expect(ledger.readPrices('2026-08')).toEqual([row('anthropic/opus', 5)]);
    expect(ledger.listPriceMonths()).toEqual(['2026-08']);
  });

  it('never rewrites, only adds', () => {
    ledger.appendPrices('2026-08', [row('anthropic/opus', 5)]);
    ledger.appendPrices('2026-08', [row('anthropic/opus', 7, '2026-08-10T02:17:00.000Z')]);

    const kept = ledger.readPrices('2026-08');
    expect(kept).toHaveLength(2);
    // The first price is still there. An archive that corrected itself would be
    // a database with worse ergonomics.
    expect(kept[0]?.prompt).toBe(5);
    expect(kept[1]?.prompt).toBe(7);
  });

  it('reports the last price per model across every month on file', () => {
    // The comparison the append rule needs: a price that has not moved must
    // not be written again, and the previous month is where it may have been.
    ledger.appendPrices('2026-07', [row('anthropic/opus', 5), row('openai/gpt', 3)]);
    ledger.appendPrices('2026-08', [row('anthropic/opus', 7)]);

    const last = ledger.lastArchivedPrices();
    expect(last.get('anthropic/opus')?.prompt).toBe(7);
    expect(last.get('openai/gpt')?.prompt).toBe(3);
    expect(last.size).toBe(2);
  });

  it('is empty rather than absent before anything is written', () => {
    expect(ledger.listPriceMonths()).toEqual([]);
    expect(ledger.readPrices('2026-08')).toEqual([]);
    expect(ledger.lastArchivedPrices().size).toBe(0);
  });
});

describe('the download archive', () => {
  const row = (name: string, date = '2026-08-09', count = 1000) => ({
    registry: 'npm',
    name,
    date,
    count,
    window: 'week',
  });

  it('writes one row per package per day', () => {
    ledger.appendDownloads('2026-08', [row('axios'), row('react')]);
    expect(ledger.readDownloads('2026-08')).toHaveLength(2);
    expect(ledger.listDownloadMonths()).toEqual(['2026-08']);
  });

  it('refuses a second row for a day already on file', () => {
    // The daily job reruns: a manual dispatch, a retry after a failure. An
    // append-only file cannot correct a duplicate afterwards, so the day
    // already written wins and the rerun adds nothing.
    ledger.appendDownloads('2026-08', [row('axios', '2026-08-09', 1000)]);
    ledger.appendDownloads('2026-08', [row('axios', '2026-08-09', 9999)]);

    const kept = ledger.readDownloads('2026-08');
    expect(kept).toHaveLength(1);
    expect(kept[0]?.count).toBe(1000);
  });

  it('still records the same package on a different day', () => {
    ledger.appendDownloads('2026-08', [row('axios', '2026-08-09')]);
    ledger.appendDownloads('2026-08', [row('axios', '2026-08-10')]);
    expect(ledger.readDownloads('2026-08')).toHaveLength(2);
  });

  it('adds the packages a rerun brings that the first run did not have', () => {
    // A partial run followed by a complete one. The packages already written
    // are left alone; the new ones land.
    ledger.appendDownloads('2026-08', [row('axios')]);
    ledger.appendDownloads('2026-08', [row('axios', '2026-08-09', 9999), row('react')]);

    const kept = ledger.readDownloads('2026-08');
    expect(kept.map((entry) => entry.name)).toEqual(['axios', 'react']);
    expect(kept[0]?.count).toBe(1000);
  });
});
