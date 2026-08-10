/**
 * The /stack card. 1600x900.
 *
 *   node scripts/build-stackcard.mjs
 *   node scripts/render-social.mjs stackcard --still
 *
 * Before and after, on one manifest, measured in a real browser rather than
 * claimed: six dependencies, one answered, then six. The old number is on the
 * card because a card that shows only the new one is asking to be believed.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Measured by pasting this manifest into the built page, headless. */
const BEFORE = 1;
const AFTER = 6;
const OF = 6;

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

  main { display: grid; grid-template-columns: 1fr 640px; gap: 78px; align-items: center; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 66px;
          line-height: 1.02; letter-spacing: -0.022em; max-width: 15ch; }
  .sub { font-family: 'Plex Serif', Georgia, serif; font-size: 25px; line-height: 1.55;
         color: #9e9e9e; margin-top: 24px; max-width: 36ch; }

  /* Before beside after, at the same size, because the comparison is the claim
     and shrinking the old number would be arguing with the picture. */
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
          background: #2c2c2c; border: 1px solid #2c2c2c; }
  .half { background: #171717; padding: 30px 32px 34px; }
  .half .cap { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 20px;
               letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; display: block; }
  .half .fig { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 132px;
               line-height: 0.9; letter-spacing: -0.03em; display: block; margin-top: 14px;
               font-variant-numeric: tabular-nums; }
  .half .of { color: #6b6b6b; font-size: 62px; }
  .half.now .fig { color: #d2e2f4; }
  .half .note { font-family: 'Plex Serif', Georgia, serif; font-size: 20px; color: #9e9e9e;
                display: block; margin-top: 12px; }

  .how { font-family: 'Plex Serif', Georgia, serif; font-size: 21px; color: #9e9e9e;
         margin-top: 24px; line-height: 1.55; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 23px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 36 })}
    <span class="kind">Your stack &middot; nothing uploaded</span>
  </header>

  <main>
    <div>
      <p class="lede">It used to answer one dependency in six.</p>
      <p class="sub">Anything the ledger had never heard of came back "not tracked" — a true
      sentence, and a useless one.</p>
    </div>

    <div>
      <div class="pair">
        <div class="half">
          <span class="cap">Before</span>
          <span class="fig">${BEFORE}<span class="of">/${OF}</span></span>
          <span class="note">Answered from the published readings</span>
        </div>
        <div class="half now">
          <span class="cap">Now</span>
          <span class="fig">${AFTER}<span class="of">/${OF}</span></span>
          <span class="note">The rest read from their own registries, live</span>
        </div>
      </div>
      <p class="how">Six registries, in your browser, at the moment you ask. The manifest never
      leaves the machine.</p>
    </div>
  </main>

  <footer>
    <span class="cmd">sighttrue.com/stack</span>
    <span>npx sighttrue check</span>
    <span>github.com/sighttrue/sighttrue</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/stackcard.html`, card, 'utf8');
console.log(`stackcard.html written — ${BEFORE}/${OF} to ${AFTER}/${OF}`);
