/**
 * The launch state, as a readout. 1600x900.
 *
 *   node scripts/build-state.mjs
 *   node scripts/render-social.mjs state --still
 *
 * Three rows: what is deployed, what was measured, and what still refuses. The
 * third is the reason this image exists — a launch card that says only "live"
 * is the version everybody posts, and it hides the half that a buyer actually
 * needs, which is what the thing cannot do yet.
 *
 * Every value is read from `src/lib/payment.ts`, so the card cannot claim a
 * state the server is not in.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const { CHARGING, TOKEN } = await import('../src/lib/payment.ts');
const catalogue = await import('../src/lib/mcp-catalogue.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));

if (TOKEN === null) {
  console.error('No token in payment.ts — nothing to draw.');
  process.exit(1);
}

/** A row of the readout: label, value, and the qualifier that keeps it honest. */
const ROWS = [
  {
    k: 'Contract',
    v: TOKEN.address,
    small: true,
    note: TOKEN.preGraduation
      ? 'Bonding curve. Replaced if it graduates — check the site before sending.'
      : 'Published on the site and on the launchpad, nowhere else.',
  },
  {
    k: 'Decimals',
    v: String(TOKEN.decimals),
    note: 'Read from the contract, not assumed.',
  },
  {
    k: 'Payment rail',
    v: CHARGING ? 'Charging' : 'Not charging',
    alert: !CHARGING,
    note: CHARGING
      ? 'Paid tools take payment in it.'
      : `No receiving wallet, no rate. All ${catalogue.MCP_TOOLS.length} tools answer free, and the refusal says why.`,
  },
];

const rows = ROWS.map(
  (r) => `<div class="row">
  <span class="k">${r.k}</span>
  <div>
    <span class="v${r.small ? ' small' : ''}${r.alert ? ' alert' : ''}">${r.v}</span>
    <span class="note">${r.note}</span>
  </div>
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

  main { display: grid; align-content: center; gap: 0; }

  .lede { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 62px;
          line-height: 1.05; letter-spacing: -0.02em; margin-bottom: 40px; max-width: 24ch; }
  .lede em { font-style: normal; color: #d2e2f4; }

  .row { display: grid; grid-template-columns: 300px 1fr; gap: 34px;
         padding: 26px 0; border-bottom: 1px solid #242424; align-items: baseline; }
  .row:first-of-type { border-top: 1px solid #2c2c2c; }
  .k { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 24px;
       letter-spacing: 0.16em; text-transform: uppercase; color: #9e9e9e; }
  .v { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 46px;
       color: #d2e2f4; display: block; line-height: 1.1; }
  /* The address is read character by character, so it drops to the monospace
     face and a size that fits it whole. Never abbreviated. */
  .v.small { font-family: 'Plex Mono', monospace; font-size: 30px; word-break: break-all; }
  .v.alert { color: #f2857c; }
  .note { font-family: 'Plex Serif', Georgia, serif; font-size: 21px; color: #9e9e9e;
          display: block; margin-top: 8px; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 22px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 36 })}
    <span class="kind">Launch state &middot; ${new Date().toISOString().slice(0, 10)}</span>
  </header>

  <main>
    <p class="lede">The token is live. <em>The rail is not.</em></p>
    ${rows}
  </main>

  <footer>
    <span>sighttrue.com/token</span>
    <span class="cmd">npx sighttrue check</span>
    <span>github.com/sighttrue/sighttrue</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/state.html`, card, 'utf8');

console.log('state.html written — 1600x900');
console.log(`contract ${TOKEN.address}, decimals ${TOKEN.decimals}, charging ${CHARGING}`);
