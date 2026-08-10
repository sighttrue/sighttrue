/**
 * The Action card. 1600x900.
 *
 *   node scripts/build-action.mjs
 *   node scripts/render-social.mjs action --still
 *
 * Six filenames, listed rather than counted, because a developer scanning this
 * is looking for their own one and a number does not tell them whether it is
 * there.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** What the shared reader knows. Two of these were unreachable from the Action. */
const FILES = [
  ['package.json', 'npm', false],
  ['Cargo.toml', 'crates.io', false],
  ['requirements.txt', 'PyPI', true],
  ['pyproject.toml', 'PyPI', true],
  ['Gemfile', 'RubyGems', true],
  ['composer.json', 'Packagist', true],
];

const rows = FILES.map(
  ([file, registry, added]) => `<div class="row${added ? ' new' : ''}">
  <span class="f">${file}</span>
  <span class="r">${registry}</span>
  <span class="t">${added ? 'new' : ''}</span>
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

  main { display: grid; grid-template-columns: 1fr 700px; gap: 74px; align-items: center; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 66px;
          line-height: 1.02; letter-spacing: -0.022em; max-width: 14ch; }
  .lede em { font-style: normal; color: #d2e2f4; }
  .sub { font-family: 'Plex Serif', Georgia, serif; font-size: 24px; line-height: 1.55;
         color: #9e9e9e; margin-top: 24px; max-width: 34ch; }

  .rows { border-top: 1px solid #2c2c2c; }
  .row { display: grid; grid-template-columns: 1fr 200px 70px; gap: 20px;
         align-items: baseline; padding: 21px 0; border-bottom: 1px solid #242424; }
  .f { font-family: 'Plex Mono', monospace; font-size: 28px; color: #6b6b6b; }
  .row.new .f { color: #e8e8e8; }
  .r { font-family: 'Plex Serif', Georgia, serif; font-size: 22px; color: #6b6b6b; }
  .row.new .r { color: #9e9e9e; }
  .t { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 17px;
       letter-spacing: 0.16em; text-transform: uppercase; color: #d2e2f4; text-align: right; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 23px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 36 })}
    <span class="kind">GitHub Action &middot; v1.1.0</span>
  </header>

  <main>
    <div>
      <p class="lede">It knew two files. <em>Now it knows six.</em></p>
      <p class="sub">The Action carried its own copy of the manifest reader and only ever learned
      two. It shares the one every other surface uses now.</p>
    </div>
    <div class="rows">${rows}</div>
  </main>

  <footer>
    <span class="cmd">uses: sighttrue/sighttrue@v1</span>
    <span>No key. No account.</span>
    <span>sighttrue.com</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/action.html`, card, 'utf8');
console.log(`action.html written — ${FILES.filter((f) => f[2]).length} newly reachable of ${FILES.length}`);
