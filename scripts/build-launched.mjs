/**
 * The launch card. 1600x900.
 *
 *   node scripts/build-launched.mjs
 *   node scripts/render-social.mjs launched --still
 *
 * The contract address is shown in full and never abbreviated. A truncated
 * address on a launch card is how somebody retypes four characters wrong and
 * sends money nowhere, and the four in the middle are the ones an impersonator
 * changes.
 *
 * `PRE_GRADUATION` is the honest qualifier: while the Virtuals record still
 * reports `tokenAddress: null`, this is the bonding-curve token and the address
 * changes if it graduates. Saying so costs one line and prevents the worst
 * outcome a launch card can cause.
 *
 * What is built next comes from the same place the roadmap does — work already
 * scoped in this repository, in order, with no dates.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { WORDMARK_CSS, wordmark } from './lib/wordmark.mjs';

const catalogue = await import('../src/lib/mcp-catalogue.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));
const { incidents } = bundle;

const n = (v) => Number(v).toLocaleString('en');

const CONTRACT = '0x9288a2961368cCebF2E2509a877Eb8EE578857fc';
const CHAIN = 'Robinhood Chain';
const PRE_GRADUATION = true;

/** Work already scoped here, in the order it will be done. No dates. */
const NEXT = [
  ['Pay per call, live', 'The x402 rail takes payment in $SGHT'],
  ['Your whole manifest', 'On-demand registry reads in the browser'],
  ['C# and Java', 'csproj and pom.xml join the five languages'],
  ['This chain, archived', 'Robinhood Chain incidents into the record'],
];

const rows = NEXT.map(
  ([what, how]) => `<div class="row"><b>${what}</b><span>${how}</span></div>`,
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
  .live { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 23px;
          letter-spacing: 0.2em; text-transform: uppercase; color: #d2e2f4; }

  main { display: grid; grid-template-columns: 1fr 560px; gap: 74px; align-items: center; }

  .tick { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 170px;
          line-height: 0.84; letter-spacing: -0.03em; display: block; }
  .on { font-family: 'Plex Serif', Georgia, serif; font-size: 30px; color: #cfcfcf;
        margin-top: 16px; display: block; }

  /* The address, whole. Two sizes down from the ticker because it is read
     character by character rather than seen. */
  .ca { margin-top: 34px; border: 1px solid #2c2c2c; border-left: 2px solid #f2857c;
        background: #171717; padding: 16px 20px 18px; }
  .ca .k { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 16px;
           letter-spacing: 0.18em; text-transform: uppercase; color: #9e9e9e; display: block; }
  .ca .v { font-family: 'Plex Mono', monospace; font-size: 26px; color: #e8e8e8;
           margin-top: 9px; display: block; word-break: break-all; line-height: 1.35; }
  .ca .note { font-family: 'Plex Serif', Georgia, serif; font-size: 18px; color: #9e9e9e;
              margin-top: 11px; display: block; }

  .next { border-top: 1px solid #2c2c2c; }
  .next .cap { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 19px;
               letter-spacing: 0.18em; text-transform: uppercase; color: #9e9e9e;
               display: block; padding: 18px 0 6px; }
  .row { padding: 17px 0; border-bottom: 1px solid #242424; }
  .row b { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 27px;
           color: #d2e2f4; display: block; }
  .row span { font-family: 'Plex Serif', Georgia, serif; font-size: 20px; color: #9e9e9e;
              display: block; margin-top: 3px; }

  footer { display: flex; justify-content: space-between; align-items: baseline; gap: 26px;
           border-top: 1px solid #2c2c2c; padding-top: 22px;
           font-family: 'Plex Mono', monospace; font-size: 22px; color: #6b6b6b; }
  footer .cmd { color: #d2e2f4; }
</style></head>
<body>
  <header>
    ${wordmark({ size: 36 })}
    <span class="live">Live on Virtuals &middot; ${CHAIN}</span>
  </header>

  <main>
    <div>
      <span class="tick">$SGHT</span>
      <span class="on">${n(incidents.total)} outages, ${n(incidents.providers)} providers,
      ${n(incidents.observedDays)} days &mdash; and the rail an agent pays with.</span>
      <div class="ca">
        <span class="k">Contract${PRE_GRADUATION ? ' &mdash; bonding curve' : ''}</span>
        <span class="v">${CONTRACT}</span>
        ${PRE_GRADUATION ? '<span class="note">Pre-graduation. This address changes if it graduates &mdash; check the site before sending.</span>' : ''}
      </div>
    </div>

    <div class="next">
      <span class="cap">Built next</span>
      ${rows}
    </div>
  </main>

  <footer>
    <span>sighttrue.com</span>
    <span class="cmd">npx sighttrue check</span>
    <span>github.com/sighttrue/sighttrue</span>
  </footer>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/launched.html`, card, 'utf8');

console.log('launched.html written — 1600x900');
console.log(`contract: ${CONTRACT}${PRE_GRADUATION ? '  (pre-graduation)' : ''}`);
console.log(`figures:  ${n(incidents.total)} outages, ${n(incidents.providers)} providers, ${n(incidents.observedDays)} days, ${catalogue.FREE_TOOLS.length}/${catalogue.MCP_TOOLS.length} free`);
