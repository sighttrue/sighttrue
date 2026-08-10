/**
 * The App card. 1600x900.
 *
 *   node scripts/build-bot.mjs
 *   node scripts/render-social.mjs bot --still
 *
 * The claim is silence, so the card is mostly quiet and the one row where the
 * bot speaks is the only one carrying colour. A card that shouted about a bot
 * that does not shout would be arguing against itself.
 *
 * Nothing here mentions the token. It is about the thing somebody can install
 * this afternoon.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Three cases, in the order of how often they happen. The loud one is last
 * because it is rarest, which is the whole argument.
 */
const CASES = [
  ['A pull request that touches no manifest', 'Nothing', false],
  ['One that adds a dependency nobody tracks', 'Nothing', false],
  ['One that adds a dependency on the watchlist', 'One comment', true],
];

const rows = CASES.map(
  ([when, says, loud]) => `<div class="row">
  <span class="when">${when}</span>
  <span class="says${loud ? ' loud' : ''}">${says}</span>
</div>`,
).join('');

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
         display: grid; grid-template-rows: auto 1fr auto; padding: 54px 68px 50px; }

  header { display: flex; justify-content: space-between; align-items: baseline;
           border-bottom: 1px solid #2c2c2c; padding-bottom: 22px; }
  header .kind { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 23px;
                 letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }

  main { display: grid; grid-template-columns: 1fr 620px; gap: 76px; align-items: center; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 88px;
          line-height: 0.98; letter-spacing: -0.024em; max-width: 13ch; }
  .sub { font-family: 'Plex Serif', Georgia, serif; font-size: 27px; line-height: 1.5;
         color: #9e9e9e; margin-top: 26px; max-width: 34ch; }

  .rows { border-top: 1px solid #2c2c2c; }
  .row { display: grid; grid-template-columns: 1fr 220px; gap: 26px; align-items: baseline;
         padding: 27px 0; border-bottom: 1px solid #242424; }
  .when { font-family: 'Plex Serif', Georgia, serif; font-size: 24px; line-height: 1.4;
          color: #cfcfcf; }
  .says { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 34px;
          color: #6b6b6b; text-align: right; }
  /* The only colour on the card, on the only row where it speaks. */
  .says.loud { color: #d2e2f4; }

  .carries { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 19px;
             letter-spacing: 0.16em; text-transform: uppercase; color: #6b6b6b;
             display: block; margin-top: 22px; line-height: 1.7; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 23px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 36 })}
    <span class="kind">GitHub App &middot; one install, no configuration</span>
  </header>

  <main>
    <div>
      <p class="lede">Most days it says nothing.</p>
      <p class="sub">That is the common case, and it is deliberate. A bot that comments to say it
      found nothing gets uninstalled.</p>
    </div>

    <div>
      <div class="rows">${rows}</div>
      <span class="carries">The comment carries: downloads &middot; scorecard<br>
      advisories &middot; licence &middot; last push</span>
    </div>
  </main>

  <footer>
    <span class="cmd">github.com/apps/sighttrue</span>
    <span>No workflow. No key.</span>
    <span>sighttrue.com</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/bot.html`, card, 'utf8');
console.log('bot.html written — 1600x900');
