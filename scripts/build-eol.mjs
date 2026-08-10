/**
 * The end-of-life countdown. 1600x900.
 *
 *   node scripts/build-eol.mjs
 *   node scripts/render-social.mjs eol --still
 *
 * Read from the lifecycle summary rather than typed. Dates are the whole claim
 * here, and a card that carried a stale one would be worse than no card: a
 * reader plans against it.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));
const { lifecycle } = bundle;

const soon = (lifecycle.soon ?? []).slice(0, 6);
if (soon.length === 0) {
  console.error('Nothing approaching — nothing to draw.');
  process.exit(1);
}

const n = (v) => Number(v).toLocaleString('en');

const rows = soon
  .map(
    (s) => `<div class="row">
  <span class="p">${s.product} ${s.cycle}</span>
  <span class="d">${s.eol}</span>
  <span class="c${s.days <= 60 ? ' near' : ''}">${n(s.days)} days</span>
</div>`,
  )
  .join('');

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

  main { display: grid; grid-template-columns: 1fr 760px; gap: 70px; align-items: center; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 60px;
          line-height: 1.03; letter-spacing: -0.022em; max-width: 15ch; }
  .lede em { font-style: normal; color: #f2857c; }
  .sub { font-family: 'Plex Serif', Georgia, serif; font-size: 24px; line-height: 1.55;
         color: #9e9e9e; margin-top: 24px; max-width: 32ch; }

  .rows { border-top: 1px solid #2c2c2c; }
  .row { display: grid; grid-template-columns: 1fr 220px 190px; gap: 20px;
         align-items: baseline; padding: 20px 0; border-bottom: 1px solid #242424; }
  .p { font-family: 'Plex Mono', monospace; font-size: 28px; color: #e8e8e8; }
  .d { font-family: 'Plex Mono', monospace; font-size: 24px; color: #6b6b6b; text-align: right; }
  .c { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 32px;
       color: #d2e2f4; text-align: right; font-variant-numeric: tabular-nums; }
  /* Inside two months takes the alert colour. Nothing else on the card does. */
  .c.near { color: #f2857c; }

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
    <span class="kind">End of life &middot; ${new Date().toISOString().slice(0, 10)}</span>
  </header>

  <main>
    <div>
      <p class="lede">These stop getting security fixes. <em>Soon.</em></p>
      <p class="sub">${n(lifecycle.ended)} release lines are already past the date. These
      ${n(lifecycle.approaching)} cross it next.</p>
    </div>
    <div>
      <div class="rows">${rows}</div>
      <span class="unit">Dates published by the maintainers themselves &middot; via endoflife.date</span>
    </div>
  </main>

  <footer>
    <span class="cmd">sighttrue.com/eol.ics</span>
    <span>Subscribe once</span>
    <span>npx sighttrue docker</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/eol.html`, card, 'utf8');
console.log(`eol.html written — ${soon.length} shown, ${n(lifecycle.approaching)} approaching, ${n(lifecycle.ended)} past`);
