/**
 * Move what survives in the pruned trend windows into the permanent archive.
 *
 * Model prices and download counts are kept inline on their live row for 35
 * days and then cut. The archive under `data/prices/` and `data/downloads/`
 * exists so that stops being the end of them — but it starts empty, and the
 * readings already collected are sitting in those trend windows waiting to be
 * deleted on schedule.
 *
 * This walks the samples that are still there and writes them across. It is a
 * one-off: after it, the daily job keeps the archive current.
 *
 * Appends nothing twice. Prices are written only where they differ from the
 * previous archived reading, and a download row for a date already on file is
 * left alone, so running this again does nothing.
 *
 *   node scripts/seed-archive.ts            # report only
 *   node scripts/seed-archive.ts --write
 */

import {
  appendDownloads,
  appendPrices,
  lastArchivedPrices,
  listDownloadMonths,
  readAdoption,
  readDownloads,
  readModels,
} from '../src/lib/ledger.ts';
import type { DownloadRow, PriceRow } from '../src/types/archive.ts';

const WRITE = process.argv.includes('--write');

// ---- prices ---------------------------------------------------------------

const archived = lastArchivedPrices();
const prices = new Map<string, PriceRow[]>();

for (const model of readModels()) {
  // Oldest first, so the change rule sees the series in the order it happened.
  const samples = [...(model.samples ?? [])].sort((a, b) => (a.at < b.at ? -1 : 1));
  let last = archived.get(model.id) ?? null;

  for (const sample of samples) {
    // Only readings the archive does not already reach. Without this the
    // oldest sample gets compared against the newest archived price on a
    // second run, reads as a change, and the series grows a row every time
    // somebody runs the script — which is the opposite of an archive.
    if (last !== null && sample.at <= last.at) continue;

    if (
      last !== null &&
      last.prompt === sample.prompt &&
      last.completion === sample.completion &&
      last.context === sample.context
    ) {
      continue;
    }

    const row: PriceRow = {
      id: model.id,
      at: sample.at,
      prompt: sample.prompt,
      completion: sample.completion,
      context: sample.context,
    };
    const month = sample.at.slice(0, 7);
    prices.set(month, [...(prices.get(month) ?? []), row]);
    last = row;
  }
}

// ---- downloads ------------------------------------------------------------

const downloads = new Map<string, DownloadRow[]>();

// Days already on file, so the report says what will actually be written
// rather than what was considered. `appendDownloads` refuses the duplicates
// either way; a report that counted them would just be wrong out loud.
const onFile = new Set<string>();
for (const month of listDownloadMonths()) {
  for (const row of readDownloads(month)) onFile.add(`${row.registry}:${row.name}:${row.date}`);
}

for (const entry of readAdoption()) {
  for (const sample of entry.samples ?? []) {
    const date = sample.at.slice(0, 10);
    const month = date.slice(0, 7);
    if (onFile.has(`${entry.registry}:${entry.name}:${date}`)) continue;
    downloads.set(month, [
      ...(downloads.get(month) ?? []),
      {
        registry: entry.registry,
        name: entry.name,
        date,
        count: sample.count,
        window: entry.window,
      },
    ]);
  }
}

const priceRows = [...prices.values()].reduce((total, rows) => total + rows.length, 0);
const downloadRows = [...downloads.values()].reduce((total, rows) => total + rows.length, 0);

process.stdout.write(
  [
    `prices     ${priceRows} rows across ${prices.size} month${prices.size === 1 ? '' : 's'}`,
    `downloads  ${downloadRows} rows across ${downloads.size} month${downloads.size === 1 ? '' : 's'}`,
  ].join('\n'),
);
process.stdout.write('\n\n');

if (WRITE) {
  for (const [month, rows] of [...prices.entries()].sort()) appendPrices(month, rows);
  for (const [month, rows] of [...downloads.entries()].sort()) appendDownloads(month, rows);
  process.stdout.write('Written. The daily job keeps it current from here.\n');
} else {
  process.stdout.write('Nothing written. Pass --write.\n');
}
