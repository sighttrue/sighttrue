/**
 * Today's model price moves, as a card. 1600x900.
 *
 *   node scripts/build-prices.mjs
 *   node scripts/render-social.mjs prices --still
 *
 * Read from the day's findings rather than typed, so the card cannot show a
 * move the ledger does not hold. Rises and falls are both on it: a card that
 * showed only the rises would be an argument rather than a reading.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));

const moves = (bundle.today ?? [])
  .filter((e) => e.kind === 'model-price' && e.metrics && typeof e.metrics.from === 'number')
  .map((e) => ({
    id: e.id.split(':')[1] ?? '?',
    from: e.metrics.from,
    to: e.metrics.to,
    factor: e.metrics.to / e.metrics.from,
  }))
  .sort((a, b) => b.factor - a.factor);

if (moves.length === 0) {
  console.error('No price moves in today — nothing to draw.');
  process.exit(1);
}

const money = (v) => '$' + (v < 0.1 ? v.toFixed(3) : v.toFixed(2)).replace(/0+$/, '').replace(/\.$/, '');
const times = (f) => (f >= 1 ? '×' + f.toFixed(1) : '−' + Math.round((1 - f) * 100) + '%');

const rows = moves
  .map(
    (m) => `<div class="row">
  <span class="id">${m.id}</span>
  <span class="from">${money(m.from)}</span>
  <span class="arrow">→</span>
  <span class="to">${money(m.to)}</span>
  <span class="f ${m.factor >= 1 ? 'up' : 'down'}">${times(m.factor)}</span>
</div>`,
  )
  .join('');

const top = moves[0];

const card = `<!doctype html><html lang="en"><head><meta charset="utf-8">
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
         display: grid; grid-template-rows: auto 1fr auto; padding: 52px 68px 48px; }

  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 1px solid #2c2c2c; padding-bottom: 20px; }
  header .kind { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 22px;
                 letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }

  main { display: grid; align-content: center; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 52px;
          line-height: 1.06; letter-spacing: -0.02em; margin-bottom: 30px; max-width: 30ch; }
  .lede em { font-style: normal; color: #f2857c; }

  .rows { border-top: 1px solid #2c2c2c; }
  .row { display: grid; grid-template-columns: 1fr 130px 40px 130px 140px;
         gap: 18px; align-items: baseline; padding: 15px 0; border-bottom: 1px solid #242424; }
  .id { font-family: 'Plex Mono', monospace; font-size: 26px; color: #e8e8e8; }
  .from { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 30px;
          color: #6b6b6b; text-align: right; font-variant-numeric: tabular-nums; }
  .arrow { color: #3b3b3b; text-align: center; font-size: 24px; }
  .to { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 30px;
        color: #e8e8e8; text-align: right; font-variant-numeric: tabular-nums; }
  .f { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 30px;
       text-align: right; font-variant-numeric: tabular-nums; }
  /* Rises take the alert colour, falls take the measured one. Two signals, and
     neither is a judgement about the provider — only about the direction. */
  .f.up { color: #f2857c; }
  .f.down { color: #d2e2f4; }

  .unit { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 19px;
          letter-spacing: 0.16em; text-transform: uppercase; color: #6b6b6b;
          display: block; margin-top: 18px; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 20px;
           font-family: 'Plex Mono', monospace; font-size: 22px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 34 })}
    <span class="kind">Model prices &middot; ${new Date().toISOString().slice(0, 10)}</span>
  </header>

  <main>
    <p class="lede">${moves.length} model prices moved today.
    One of them <em>${times(top.factor)}</em>.</p>
    <div class="rows">${rows}</div>
    <span class="unit">USD per million prompt tokens &middot; as the providers published them</span>
  </main>

  <footer>
    <span class="cmd">sighttrue.com/models</span>
    <span>Every change dated</span>
    <span>github.com/sighttrue/sighttrue</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/prices.html`, card, 'utf8');
console.log(`prices.html written — ${moves.length} moves, top ${top.id} ${times(top.factor)}`);
