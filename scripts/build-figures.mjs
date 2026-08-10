/**
 * The images that sit between an article's sections. 1600x900.
 *
 *   node scripts/build-figures.mjs
 *   node scripts/render-social.mjs figure-archive --still
 *   node scripts/render-social.mjs figure-exchange --still
 *   node scripts/render-social.mjs figure-price --still
 *
 * ## What these are for
 *
 * A long piece on a timeline is scrolled past unless something interrupts it.
 * Each of these replaces a horizontal rule between two sections, and each one
 * carries a reading rather than a decoration: a reader who stops at the image
 * and reads nothing else still leaves with the fact.
 *
 * Three, not six. They break the article at its three turns — what is held,
 * how it is bought, what it costs — and an article broken every two paragraphs
 * reads as a slide deck.
 *
 * Every figure comes from the bundle and the catalogue, like the cards and the
 * film. None of them shows a price, a supply or a return.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const catalogue = await import('../src/lib/mcp-catalogue.ts');
const { CHAIN_CAIP2, CHAIN_NETWORK } = await import('../src/lib/chain.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));
const { incidents, lifecycle, models } = bundle;

const n = (value) => Number(value).toLocaleString('en');

/** Shared head. Same faces and ground as every other artefact this emits. */
const HEAD = `<meta charset="utf-8">
<style>
  @font-face { font-family: 'Plex Condensed'; font-weight: 600;
    src: url('../../dist/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Mono'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Serif'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-serif-latin-400-normal.woff2') format('woff2'); }
${WORDMARK_CSS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1600px; height: 900px; background: #121212; color: #e8e8e8;
         font-family: 'Plex Mono', monospace; overflow: hidden;
         display: grid; grid-template-rows: auto 1fr auto; padding: 58px 70px 54px; }

  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 1px solid #2c2c2c; padding-bottom: 22px; }
  header .kind { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 22px;
                 letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }

  main { display: grid; align-content: center; }

  footer { display: flex; justify-content: space-between; align-items: baseline;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 21px; color: #6b6b6b; }

  .say { font-family: 'Plex Serif', Georgia, serif; font-size: 30px; line-height: 1.45;
         color: #9e9e9e; max-width: 58ch; }
</style>`;

const page = (kind, body) => `<!doctype html><html lang="en"><head>${HEAD}</head>
<body>
  <header>${wordmark({ size: 32 })}<span class="kind">${kind}</span></header>
  <main>${body}</main>
  <footer><span>sighttrue.com</span><span>@Sighttruehq</span></footer>
</body></html>`;

/* ------------------------------------------------------------------ one
 *
 * What is held. Every provider in the archive, as a bar of its own count, with
 * the four that carry the most named. A reader sees the shape of the thing
 * before they see any single number in it.
 */
const byProvider = incidents.byProvider.filter((row) => row.count > 0);
const widest = Math.max(...byProvider.map((row) => row.count));

const bars = byProvider
  .map((row) => {
    const share = Math.round((row.count / widest) * 100);
    return `<div class="bar" style="height:${Math.max(3, share)}%" title="${row.name}"></div>`;
  })
  .join('');

const archive = page(
  'Provider incident archive',
  `<div class="grid">
  <div>
    <span class="fig">${n(incidents.total)}</span>
    <span class="unit">outages kept</span>
    <p class="say">Across ${n(incidents.providers)} providers and ${n(incidents.observedDays)} days,
    after the status pages that announced them had moved on.</p>
  </div>
  <div class="chart">
    <div class="bars">${bars}</div>
    <span class="axis">One mark per provider with an incident on record &mdash; ${byProvider.length}
    of the ${n(incidents.providers)} watched, by how many of its incidents this holds</span>
  </div>
</div>
<style>
  .grid { display: grid; grid-template-columns: 1fr 720px; gap: 70px; align-items: center; }
  .fig { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 200px;
         line-height: 0.84; letter-spacing: -0.028em; color: #d2e2f4; display: block;
         font-variant-numeric: tabular-nums; }
  .unit { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 40px;
          display: block; margin: 10px 0 24px; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 340px;
          border-bottom: 1px solid #3b3b3b; }
  .bar { flex: 1; background: #d2e2f4; min-height: 3px; }
  .axis { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 19px;
          letter-spacing: 0.16em; text-transform: uppercase; color: #6b6b6b;
          display: block; margin-top: 18px; }
</style>`,
);

/* ------------------------------------------------------------------ two
 *
 * How it is bought. The exchange, as the four messages it is. This is the one
 * an agent-shaped reader stops on.
 */
// x402 is spelled with a lowercase x. The eyebrow uppercases its contents and
// turned the protocol's name into something that is not its name — the same
// slip the film made, caught the same way, by reading the output back.
const exchange = page(
  'Pay per call &mdash; <span style="text-transform:none">x402</span> over HTTP',
  `<table class="wire">
  <tr><td class="dir">&rarr;</td><td class="code">POST</td><td class="what">/api/mcp</td><td class="say2">An agent asks for one reading</td></tr>
  <tr><td class="dir">&larr;</td><td class="code">402</td><td class="what">PAYMENT-REQUIRED</td><td class="say2">Price, asset, chain, and where to send it</td></tr>
  <tr><td class="dir">&rarr;</td><td class="code">POST</td><td class="what">PAYMENT-PAYLOAD</td><td class="say2">The same request, carrying the receipt</td></tr>
  <tr><td class="dir">&larr;</td><td class="code">200</td><td class="what">the reading</td><td class="say2">Verified on chain first, twelve confirmations</td></tr>
</table>
<p class="tail">No account is created at any point, and none is needed.
<span class="chain">${CHAIN_NETWORK} &middot; ${CHAIN_CAIP2}</span></p>
<style>
  .wire { border-collapse: collapse; width: 100%; font-size: 34px; }
  .wire td { padding: 24px 26px 24px 0; border-bottom: 1px solid #242424; vertical-align: baseline; }
  .wire tr:first-child td { border-top: 1px solid #2c2c2c; }
  .dir { color: #6b6b6b; width: 40px; }
  .code { color: #d2e2f4; font-variant-numeric: tabular-nums; width: 110px; }
  .what { color: #e8e8e8; white-space: nowrap; width: 420px; }
  .say2 { font-family: 'Plex Serif', Georgia, serif; font-size: 29px; color: #9e9e9e; }
  .tail { display: flex; justify-content: space-between; align-items: baseline; margin-top: 34px;
          font-family: 'Plex Serif', Georgia, serif; font-size: 27px; color: #9e9e9e; }
  .chain { font-family: 'Plex Mono', monospace; font-size: 22px; color: #6b6b6b; }
</style>`,
);

/* ---------------------------------------------------------------- three
 *
 * What it costs, and what it does not. The free count is the claim most worth
 * making, so it is the largest thing on the image.
 */
const free = catalogue.FREE_TOOLS.length;
const total = catalogue.MCP_TOOLS.length;
const band = (credits, name, why) => `<div class="band">
  <span class="c">${credits}</span>
  <div><b>${name}</b><span>${why}</span></div>
</div>`;

const price = page(
  'What a call costs',
  `<div class="split">
  <div>
    <span class="fig2">${free}<span class="of">/${total}</span></span>
    <span class="unit2">tools stay free</span>
    <p class="say">Enforced by a test rather than by a sentence. The rest are priced by how hard the
    reading is to get, never by what it might be worth to you.</p>
  </div>
  <div class="bands">
    ${band(1, 'Restates a public source', 'The answer exists; fetching it does not')}
    ${band(2, 'Joins sources nobody joins', 'Each half is free. The join is the work')}
    ${band(5, 'Rests on the archive', 'Cannot be reconstructed by anybody who did not start then')}
  </div>
</div>
<style>
  .split { display: grid; grid-template-columns: 1fr 740px; gap: 70px; align-items: center; }
  .fig2 { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 190px;
          line-height: 0.84; letter-spacing: -0.028em; color: #d2e2f4; display: block;
          font-variant-numeric: tabular-nums; }
  .of { color: #6b6b6b; font-size: 96px; }
  .unit2 { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 40px;
           display: block; margin: 8px 0 24px; }
  .bands { display: grid; gap: 0; border-top: 1px solid #2c2c2c; }
  .band { display: grid; grid-template-columns: 110px 1fr; gap: 26px; align-items: baseline;
          padding: 26px 0; border-bottom: 1px solid #242424; }
  .band .c { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 62px;
             color: #d2e2f4; text-align: right; font-variant-numeric: tabular-nums; }
  .band b { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 34px;
            display: block; margin-bottom: 5px; }
  .band span { font-family: 'Plex Serif', Georgia, serif; font-size: 25px; color: #9e9e9e; }
</style>`,
);

writeFileSync(`${ROOT}assets/brand/figure-archive.html`, archive, 'utf8');
writeFileSync(`${ROOT}assets/brand/figure-exchange.html`, exchange, 'utf8');
writeFileSync(`${ROOT}assets/brand/figure-price.html`, price, 'utf8');

console.log('three figures written — 1600x900 each');
console.log(`archive:  ${n(incidents.total)} outages, ${byProvider.length} providers charted`);
console.log(`exchange: ${CHAIN_NETWORK}, ${CHAIN_CAIP2}`);
console.log(`price:    ${free} of ${total} free`);
console.log(`unused here but in the article: ${n(lifecycle.ended)} ended, ${n(models.available)} models`);
