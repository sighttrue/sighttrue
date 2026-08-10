/**
 * The launch caption, with today's figures in it.
 *
 *   node scripts/caption.mjs           # long form, for a platform without a limit
 *   node scripts/caption.mjs --short   # under 280 characters
 *
 * ## Why this is a script
 *
 * A caption was written into docs/BRAND.md with "618 outages ... 731 days" in
 * it. Three hours later the daily run committed and the site said 619 and 720,
 * because `observedDays` is measured from the oldest row still held rather than
 * from a fixed start. The caption was already wrong and nothing would ever have
 * told anybody — a post is the one artefact with no build step between writing
 * it and publishing it.
 *
 * So the figures are read at the moment the caption is produced. Run this, copy
 * what it prints, post it. If the numbers moved since the last time, they moved
 * in the caption too.
 *
 * The wording is fixed here rather than in a document for the same reason the
 * cards are generated: the sentence and the number it contains have to change
 * together or not at all.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));

const { incidents, lifecycle, models } = bundle;
const n = (v) => Number(v).toLocaleString('en');
const short = process.argv.includes('--short');

/**
 * It leads with the archive and names no repository count.
 *
 * The readings that never touch GitHub are the answer to "a GitHub summariser
 * is worth only what GitHub already shows you". A caption opening with a
 * watchlist size concedes that in its first line, and a count of what this
 * project watches is a fact about this project rather than about the reader.
 */
const long = `Every status page forgets. They carry a few months, then the incident is gone and the provider's record goes with it.

This kept ${n(incidents.observedDays)} days. ${n(incidents.total)} outages across ${n(incidents.providers)} providers, each with how long they said it took${medians()}.

Also ${n(lifecycle.ended)} release lines already past the date they stop getting security fixes, and ${n(models.available)} models with every price change dated.

None of that comes from GitHub. Your agent can buy any of it one call at a time — no signup, no key, no human.

npx sighttrue check

$SGHT — launching on Virtuals, Robinhood Chain.

sighttrue.com`;

const brief = `Status pages forget. This kept ${n(incidents.observedDays)} days — ${n(incidents.total)} outages across ${n(incidents.providers)} providers, with how long each actually took.

Plus ${n(lifecycle.ended)} release lines past end-of-life, and ${n(models.available)} model prices, dated.

None of it from GitHub.

npx sighttrue check

$SGHT — Virtuals, Robinhood Chain.`;

/** Four providers by volume, with the median duration they announced. */
function medians() {
  const rows = incidents.byProvider
    .filter((row) => row.medianMinutes !== null)
    .slice(0, 4)
    .map((row) => `${row.name} ${n(row.medianMinutes)}`);

  return rows.length === 0 ? '' : ` — ${rows.join(', ')}, in minutes`;
}

const text = short ? brief : long;

process.stdout.write(`${text}\n`);
process.stderr.write(
  `\n--- ${text.length} characters${short && text.length > 280 ? '  OVER THE 280 LIMIT' : ''}\n` +
    `--- figures read from dist/data/index.json, built ${bundle.today?.[0]?.detectedAt?.slice(0, 10) ?? 'unknown'}\n` +
    `--- post it with assets/brand/launch.mp4\n`,
);
