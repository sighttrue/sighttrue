/**
 * The launch caption, with today's figures in it.
 *
 *   node scripts/caption.mjs           # long form, for a platform without a limit
 *   node scripts/caption.mjs --short   # under 280 characters
 *   node scripts/caption.mjs --article # the long-form piece, ready to paste
 *   node scripts/caption.mjs --quote   # the line that goes above the article
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

// The tool counts come from the catalogue, never from a number typed here. The
// pricing page carried "seven MCP tools" for weeks against a server answering
// eight, and the README advertised eight against thirty-one.
const catalogue = await import('../src/lib/mcp-catalogue.ts');
const FREE_TOOLS = catalogue.FREE_TOOLS.length;
const TOTAL_TOOLS = catalogue.MCP_TOOLS.length;

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

/** The four providers the archive holds most of, as a table an article can use. */
function medianTable() {
  return incidents.byProvider
    .filter((row) => row.medianMinutes !== null)
    .slice(0, 5)
    .map((row) => `${row.name} — ${n(row.count)} incidents, ${n(row.medianMinutes)} minutes median`)
    .join('\n');
}

/**
 * The long-form piece, for a platform that has one.
 *
 * Its first three lines are written to stand alone, because that is what a
 * reader sees before deciding to open it — an article whose opening needs the
 * headline to make sense has spent its only chance.
 *
 * It leads with the archive and names no repository count, for the reason set
 * out in docs/BRAND.md: the readings that never touch GitHub are the answer to
 * the objection this product exists to meet.
 */
const article = `Every status page forgets.

They carry a few months, then the incident is gone — and with it the record of how a provider actually behaves, which is the only thing anybody wanted from a status page in the first place.

This one has been keeping them for ${n(incidents.observedDays)} days. ${n(incidents.total)} outages across ${n(incidents.providers)} providers, each with the duration the provider itself announced.

## How long they actually take

${medianTable()}

Median across incidents that published both a start and an end. A median is not a promise about the next one, and an incident that was never given an end time is not counted here at all. Those two sentences are why this is worth reading: the number is bounded, and the bound is stated.

Nobody else has this, because it cannot be reconstructed. A status page that deleted an incident in ${n(incidents.observedDays)} days of history did not keep a copy for you. Either something was reading it at the time or the record is gone.

## What else is measured

${n(lifecycle.ended)} release lines are already past the date they stop receiving security fixes. ${n(lifecycle.approaching)} more cross it in the current window. ${n(models.available)} models are tracked with every price change dated. ${n(bundle.staleness.measured)} packages carry the date their registry actually shipped them, which is not the date of their last commit. ${n(bundle.contributors.measured)} commit histories are read for the bus factor.

None of that comes from a repository host. All of it is committed to a public repository every four hours, timestamped and append-only, so any figure on any page can be checked against the file it came from.

## Why a token

An AI agent cannot use a credit card.

It has no billing address. It cannot answer a 3-D Secure prompt. It cannot open an account or agree to terms on anyone's behalf. Every one of those is load-bearing in card payments and none of them has a machine-shaped answer.

The workaround the industry settled on is to make the machine borrow a human's credentials — an API key, issued to a person, billed to a person's card, pasted into a program. It works, and it means every purchase a machine makes has to be arranged in advance by somebody who signed up first.

A wallet is the one payment instrument a machine can hold on its own terms. $SGHT is what this service charges in, so an agent that has never met its operator can still buy one answer.

## Four messages, no account

The protocol is x402 — HTTP's own answer to being asked for money.

1. The agent asks for a reading.
2. The server replies 402 with the price, the asset, the chain and where to send it.
3. The agent pays and asks again, carrying the receipt.
4. The server verifies it on chain — twelve confirmations — and answers.

There is no signup step because there is nowhere to sign up to.

## What a call costs

Priced by how hard the reading is to get, not by how valuable it might be to you. That second one is a guess about your business.

1 credit restates a public source. 2 joins sources nobody joins. 5 rests on the archive — answerable only because the reading was taken and kept every four hours for as long as this has been running.

${n(FREE_TOOLS)} of the ${n(TOTAL_TOOLS)} tools stay free, and a test enforces that rather than a sentence on a page.

## What the token is not

It is not access to the site. Every page, bundle and archive is free to read and free to download, holder or not.

It is not a governance token. Holding it votes on nothing. The watchlist changes by reviewed commit, in public.

It is not a claim on revenue. It is payment for a service, in the ordinary sense that a token is what the meter reads.

There is nothing to connect a wallet to, and there will not be.

It does not make the readings better. Paid tools are not more accurate than free ones — they are harder to produce, and a paid answer carries the same stated limits as a free one.

## Check it before you believe it

    npx sighttrue check

One command. It reads the manifest in the current directory and reports what is on record. No account, nothing uploaded.

The readings are at sighttrue.com. The agent that takes them is at github.com/sighttrue/sighttrue, and its commit log is the argument.

$SGHT launches on Virtuals, on Robinhood Chain.`;

/**
 * The line that carries the article, quoting the film.
 *
 * It has one job — make somebody open the thing — so it states the strangest
 * true fact and stops.
 */
const quote = `Status pages keep a few months. We kept ${n(incidents.observedDays)} days.

${n(incidents.total)} outages across ${n(incidents.providers)} providers, with how long each one said it actually took. Plus what stops getting security fixes, and what quietly changed price.

Your agent can buy any of it, one call at a time.`;

const text = process.argv.includes('--article')
  ? article
  : process.argv.includes('--quote')
    ? quote
    : short
      ? brief
      : long;

process.stdout.write(`${text}\n`);
process.stderr.write(
  `\n--- ${text.length} characters${short && text.length > 280 ? '  OVER THE 280 LIMIT' : ''}\n` +
    `--- figures read from dist/data/index.json, built ${bundle.today?.[0]?.detectedAt?.slice(0, 10) ?? 'unknown'}\n` +
    `--- post it with assets/brand/launch.mp4\n`,
);
