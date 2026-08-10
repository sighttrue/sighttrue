/**
 * The article cover. 2000x800, which is the 5:2 the editor asks for.
 *
 *   node scripts/build-cover.mjs
 *   node scripts/render-social.mjs cover --still
 *
 * ## What it has to survive
 *
 * A timeline renders this about 600px wide on a phone. Everything on it is
 * sized for that rather than for the file: the figure is enormous, there are
 * four supporting rows and not fourteen, and nothing is set below what would be
 * 11px once it has been scaled down. A cover that needs to be opened to be read
 * has failed at the only job it has.
 *
 * It carries the same claim as the headline it sits above — the archive, and
 * how long each provider said its own incidents took. Not the token: a cover
 * that opens with a ticker is asking for a decision from somebody who has not
 * read the argument yet.
 *
 * Every figure comes from the bundle, like the cards and the film.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));
const { incidents } = bundle;

const n = (value) => Number(value).toLocaleString('en');

/**
 * Four providers, the ones the archive holds most of.
 *
 * Four rather than the five the article lists: a fifth row costs the figure
 * beside it about forty pixels of height, and at timeline scale that is the
 * difference between a number you can read and one you cannot.
 */
const MEDIANS = incidents.byProvider
  .filter((row) => row.medianMinutes !== null)
  .slice(0, 4)
  .map((row) => ({ name: row.name, minutes: row.medianMinutes }));

const rows = MEDIANS.map(
  (row) => `<div class="row">
    <span class="who">${row.name}</span>
    <span class="dots"></span>
    <span class="mins">${n(row.minutes)}</span>
  </div>`,
).join('');

const cover = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'Plex Condensed'; font-weight: 600;
    src: url('../../dist/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Mono'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Serif'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-serif-latin-400-normal.woff2') format('woff2'); }

${WORDMARK_CSS}
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 2000px; height: 800px; background: #121212; color: #e8e8e8;
    font-family: 'Plex Mono', monospace; overflow: hidden;
    display: grid; grid-template-rows: auto 1fr auto;
    padding: 62px 76px 58px;
  }

  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 1px solid #2c2c2c; padding-bottom: 26px; }
  header .stamp { font-family: 'Plex Mono', monospace; font-size: 26px; color: #6b6b6b;
                  letter-spacing: 0.05em; }

  /* Two columns: the claim, and the evidence for it. */
  main { display: grid; grid-template-columns: 1fr 660px; gap: 90px;
         align-items: center; padding: 8px 0 0; }

  .eyebrow { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 25px;
             letter-spacing: 0.22em; text-transform: uppercase; color: #9e9e9e;
             margin-bottom: 22px; display: block; }

  .figure { font-family: 'Plex Condensed', sans-serif; font-weight: 600;
            font-variant-numeric: tabular-nums; font-size: 230px; line-height: 0.84;
            letter-spacing: -0.028em; color: #d2e2f4; display: block; }
  .unit { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 46px;
          letter-spacing: 0.02em; color: #e8e8e8; display: block; margin-top: 10px; }
  .say { font-family: 'Plex Serif', Georgia, serif; font-size: 33px; line-height: 1.42;
         color: #cfcfcf; max-width: 22ch; margin-top: 26px; }

  /* The evidence. A leader between name and number, because the eye has to
     cross ninety pixels of nothing to get from one to the other. */
  .rows { display: grid; gap: 0; border-top: 1px solid #2c2c2c; }
  .row { display: flex; align-items: baseline; gap: 20px;
         border-bottom: 1px solid #242424; padding: 21px 0; }
  .who { font-family: 'Plex Mono', monospace; font-size: 34px; color: #e8e8e8; white-space: nowrap; }
  .dots { flex: 1; border-bottom: 1px dotted #3b3b3b; transform: translateY(-8px); }
  .mins { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 46px;
          font-variant-numeric: tabular-nums; color: #d2e2f4; }
  .rows-note { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 21px;
               letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b;
               margin-top: 20px; display: block; }

  footer { display: flex; justify-content: space-between; align-items: baseline;
           border-top: 1px solid #2c2c2c; padding-top: 26px; }
  footer .url { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 30px;
                letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }
  footer .handle { font-family: 'Plex Mono', monospace; font-size: 25px; color: #6b6b6b; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 40 })}
    <span class="stamp">Provider incident archive</span>
  </header>

  <main>
    <div>
      <span class="eyebrow">Kept after their own status pages dropped them</span>
      <span class="figure">${n(incidents.observedDays)}</span>
      <span class="unit">days of incident history</span>
      <p class="say">${n(incidents.total)} outages across ${n(incidents.providers)} providers, each with the duration the provider itself announced.</p>
    </div>

    <div>
      <div class="rows">${rows}</div>
      <span class="rows-note">Median minutes, announced</span>
    </div>
  </main>

  <footer>
    <span class="url">sighttrue.com</span>
    <span class="handle">@Sighttruehq</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/cover.html`, cover, 'utf8');

console.log('cover.html written — 2000x800, the 5:2 the article editor asks for');
console.log(`figures: ${n(incidents.observedDays)} days, ${n(incidents.total)} outages, ${n(incidents.providers)} providers`);
console.log(`rows: ${MEDIANS.map((m) => `${m.name} ${m.minutes}`).join(', ')}`);
