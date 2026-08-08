/**
 * Fill in the four package fields that were being thrown away.
 *
 * The staleness collector reads one document per package and took one field
 * from it. It now takes five: whether the publisher has withdrawn the package,
 * what it runs on the installing machine, how big it is, and where its
 * maintainers ask to be paid. All four were in the same response and none of
 * them costs a request.
 *
 * This exists because of what the first scheduled run would otherwise do. A row
 * written before the field existed serialises it as null, which is
 * indistinguishable from "read, and not withdrawn" — so every package that has
 * been deprecated for years would file a finding on the same day, exactly the
 * shape of the 341 licence findings this project has already had to retract.
 * Filling the field once, before the first run, is what makes the comparison
 * mean something.
 *
 * Deliberately files no findings. It is a starting point, not a change.
 *
 *   node scripts/backfill-packages.ts            # report only
 *   node scripts/backfill-packages.ts --write
 */

import { collectStaleness } from '../src/collectors/staleness.ts';
import { readAdoption, readStaleness, writeStaleness } from '../src/lib/ledger.ts';

const WRITE = process.argv.includes('--write');

const held = readStaleness();
const packages = readAdoption();

process.stdout.write(`${held.length} rows on file, ${packages.length} packages mapped\n`);
process.stdout.write('Reading every registry document once. This takes a few minutes.\n\n');

const now = new Date();
const result = await collectStaleness(packages, held, {
  now: now.toISOString(),
  today: now.toISOString().slice(0, 10),
});

// Discarded on purpose. Every one of them would be a finding about something
// that happened before this project was looking.
const suppressed = result.events.length;

const withdrawn = result.rows.filter((row) => row.withdrawn !== null);
const scripted = result.rows.filter((row) => row.installScripts !== null);
const sized = result.rows.filter((row) => row.bytes !== null);
const funded = result.rows.filter((row) => row.funding !== null);

process.stdout.write(
  [
    `read            ${result.rows.length} packages in ${result.requests} requests`,
    `withdrawn       ${withdrawn.length} marked deprecated or yanked by their publisher`,
    `install scripts ${scripted.length} run something on the installing machine`,
    `weighed         ${sized.length} publish an artefact size`,
    `funding         ${funded.length} say where to fund them`,
    `findings        ${suppressed} suppressed — a first reading is not a change`,
    `errors          ${result.errors.length}`,
  ].join('\n'),
);
process.stdout.write('\n\n');

for (const row of withdrawn.slice(0, 8)) {
  process.stdout.write(`  ${row.registry}:${row.name} — ${row.withdrawn}\n`);
}
if (withdrawn.length > 8) process.stdout.write(`  … and ${withdrawn.length - 8} more\n`);
process.stdout.write('\n');

for (const error of result.errors.slice(0, 5)) process.stdout.write(`  warn: ${error}\n`);

if (WRITE) {
  writeStaleness(result.rows);
  process.stdout.write(`\nWritten. ${result.rows.length} rows.\n`);
} else {
  process.stdout.write('\nNothing written. Pass --write to record the readings.\n');
}
