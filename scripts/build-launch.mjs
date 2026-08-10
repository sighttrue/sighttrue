/**
 * The launch film: thirteen seconds explaining what the token is for.
 *
 *   node scripts/build-launch.mjs        # writes assets/brand/launch.html
 *   node scripts/render-social.mjs launch
 *
 * ## Why this is a separate film
 *
 * `film.html` is the evergreen one — the name, the figures, the domain. It has
 * to stay true on any day it is posted. This one names a token that does not
 * exist yet and a platform the maintainer picked, so it is dated by nature and
 * kept apart rather than bolted onto the film that is not.
 *
 * ## What it may claim
 *
 * The same rule the cards live under: every figure is read from the bundle or
 * the catalogue at build time, never typed here. A launch video is the single
 * most-quoted artefact a project emits and the one nobody can check, which is
 * exactly why it gets the strictest source of truth rather than the loosest.
 *
 * The claims are deliberately narrow. It does not say the token will rise, does
 * not name a price, does not promise a supply, and does not call anything an
 * investment. It says what the tool does and how it is paid for, both of which
 * are already built and both of which can be checked by reading the repository.
 *
 * ## The other logo
 *
 * `virtuals.jpg` is Virtuals' own avatar, embedded unmodified. Two logos side by
 * side is the grammar of a joint announcement, so the layout does not use it:
 * the mark sits under the words "launching on", which is a statement about where
 * this launches and not a claim that anybody co-signed it. Redrawing their mark
 * to fit the palette would be worse — an approximated trademark is both a wrong
 * logo and still a trademark.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { MCP_TOOLS, FREE_TOOLS, PAID_TOOLS } = await import('../src/lib/mcp-catalogue.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));

const HANDLE = '@Sighttruehq';
const SYMBOL = '$SGHT';
const PLATFORM = 'Virtuals';

/** Their avatar, inlined so the film renders from one file with no fetch. */
const virtuals = readFileSync(`${ROOT}assets/brand/virtuals.jpg`).toString('base64');

const round = (n) => Number(n.toFixed(2));

/** Same wordmark helper as the cards. Duplicated deliberately — see build-social.mjs. */
function wordmark({ size = 64, colour = '#e8e8e8', rule = '#f2857c' } = {}) {
  const u = size / 64;
  return `<span class="wm" style="font-size:${round(size)}px;color:${colour}">
    <span>sigh</span><span class="wm-tt">tt<i style="background:${rule};height:${round(Math.max(1.5, 3.4 * u))}px"></i></span><span>rue</span>
  </span>`;
}

/**
 * Six paid tools, looked up by name rather than transcribed with their prices.
 *
 * The pricing page and the server disagreed for weeks the last time a count was
 * held in two places. A film is worse: it is screenshotted and outlives the
 * correction.
 */
const SHOWN = [
  'provider_incidents',
  'model_price_history',
  'withdrawn_but_installed',
  'time_to_fix',
  'funding_gap',
  'typosquat_check',
].map((name) => {
  const tool = MCP_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`build-launch: no tool named ${name}`);
  if (tool.tier !== 'paid') throw new Error(`build-launch: ${name} is free, not paid`);
  return [tool.name, tool.credits];
});

const FPS = 30;
const SECONDS = 13;

const launch = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<style>
  @font-face { font-family: 'Plex Condensed'; font-weight: 600;
    src: url('../../dist/fonts/ibm-plex-sans-condensed-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Mono'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Plex Serif'; font-weight: 400;
    src: url('../../dist/fonts/ibm-plex-serif-latin-400-normal.woff2') format('woff2'); }

  .wm { font-family: 'Plex Condensed', sans-serif; font-weight: 600;
        letter-spacing: -0.022em; line-height: 1; white-space: nowrap;
        display: inline-block; text-transform: none; }
  .wm-tt { position: relative; }
  .wm-tt i { position: absolute; left: -0.10em; right: -0.16em; top: 0.325em; display: block; }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 675px; background: #121212; color: #e8e8e8;
         font-family: 'Plex Mono', monospace; overflow: hidden; position: relative; }

  /* Persistent chrome. The frame never changes, so the reader is never in doubt
     about what they are watching — and the scenes change inside it, which is how
     an instrument behaves and not how a slideshow does. */
  .chrome { position: absolute; left: 72px; right: 72px; top: 52px; display: flex;
            justify-content: space-between; align-items: baseline;
            border-bottom: 1px solid #2c2c2c; padding-bottom: 16px; }
  .chrome .stamp { font-family: 'Plex Mono', monospace; font-size: 17px; color: #6b6b6b;
                   letter-spacing: 0.04em; }

  /* Centred rather than top-aligned. Every scene here is shorter than the frame,
     and hanging them all from the top left a dead third at the bottom that read
     as a slide with content missing. */
  .stage { position: absolute; left: 72px; right: 72px; top: 132px; bottom: 118px;
           display: grid; align-content: center; }

  .foot { position: absolute; left: 72px; right: 72px; bottom: 56px; display: flex;
          justify-content: space-between; align-items: center; }
  .foot .url { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 22px;
               letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }
  .foot .handle { font-family: 'Plex Mono', monospace; font-size: 17px; color: #6b6b6b; }

  /* The one animated thing, and it encodes elapsed time. Everything else here
     appears in reading order and then holds still. */
  .track { position: absolute; left: 72px; right: 72px; bottom: 34px; height: 2px; background: #262626; }
  .track i { display: block; height: 2px; background: #6b6b6b; }

  .eyebrow { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 18px;
             letter-spacing: 0.2em; text-transform: uppercase; color: #9e9e9e; }

  /* Interpretation is set in the serif; measurement never is. The same rule the
     site runs on, so the film and the product read as one thing. */
  .say { font-family: 'Plex Serif', Georgia, serif; font-size: 62px; line-height: 1.2;
         letter-spacing: -0.014em; }
  .said { color: #d2e2f4; }
  .note { font-family: 'Plex Mono', monospace; font-size: 21px; color: #9e9e9e; letter-spacing: 0.01em; }

  /* The exchange, as it actually happens over the wire. Fixed column widths, so
     the four lines read as one table being filled in rather than four sentences
     that happen to be stacked. */
  .wire { display: grid; gap: 16px; font-family: 'Plex Mono', monospace; font-size: 24px; }
  .wire div { display: flex; gap: 22px; align-items: baseline; white-space: nowrap; }
  .wire .dir { color: #6b6b6b; width: 18px; }
  .wire .code { color: #d2e2f4; font-variant-numeric: tabular-nums; width: 58px; }
  .wire .what { color: #e8e8e8; width: 300px; }
  .wire .tail { color: #9e9e9e; }

  .rows { display: grid; gap: 12px; }
  .row { display: flex; justify-content: space-between; align-items: baseline;
         border-bottom: 1px solid #242424; padding-bottom: 10px; }
  .row span { font-family: 'Plex Mono', monospace; font-size: 24px; color: #e8e8e8; }
  .row b { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 26px;
           font-variant-numeric: tabular-nums; color: #d2e2f4; letter-spacing: 0.02em; }
  /* A bare column of 5s and 2s is not a reading. The head names the unit, which
     is the difference between an instrument and a price sticker. */
  .rows .head { border-bottom-color: #3a3a3a; }
  .rows .head span, .rows .head b { font-family: 'Plex Condensed', sans-serif; font-weight: 600;
    font-size: 16px; letter-spacing: 0.18em; text-transform: uppercase; color: #6b6b6b; }

  .ticker { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 96px;
            letter-spacing: -0.02em; line-height: 1; color: #e8e8e8; }

  .on { display: flex; align-items: center; gap: 26px; }
  .on img { width: 84px; height: 84px; border-radius: 18px; display: block; }
  .on b { font-family: 'Plex Condensed', sans-serif; font-weight: 600; font-size: 62px;
          letter-spacing: -0.015em; color: #e8e8e8; }
</style></head>
<body>
  <div class="chrome">
    ${wordmark({ size: 26 })}
    <span class="stamp" id="stamp"></span>
  </div>
  <div class="stage" id="stage"></div>
  <div class="foot">
    <span class="url">sighttrue.com</span>
    <span class="handle">${HANDLE}</span>
  </div>
  <div class="track"><i id="bar"></i></div>
<script>
  var FPS = ${FPS};
  var SECONDS = ${SECONDS};
  var frame = Number(new URLSearchParams(location.search).get('f') || 0);
  var t = frame / FPS;

  var ease = function (x) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3); };
  var at = function (from, to) { return ease((t - from) / (to - from)); };

  // Appears in reading order and then holds. No fade out, no drift: a line that
  // is still moving while the next one arrives is decoration.
  var line = function (html, from, cls) {
    var p = at(from, from + 0.75);
    return '<div class="' + (cls || '') + '" style="opacity:' + p +
      ';transform:translateY(' + (14 - 14 * p).toFixed(2) + 'px)">' + html + '</div>';
  };

  var WIRE = ${JSON.stringify([
    ['&rarr;', 'POST', '/api/mcp', 'check_before_install'],
    ['&larr;', '402', 'PAYMENT-REQUIRED', '2 credits, ' + SYMBOL],
    ['&rarr;', 'POST', '/api/mcp', 'PAYMENT-PAYLOAD'],
    ['&larr;', '200', 'reading taken', 'no account, no key'],
  ])};
  var TOOLS = ${JSON.stringify(SHOWN)};
  var LOGO = 'data:image/jpeg;base64,${virtuals}';

  var stage = document.getElementById('stage');
  // The ticker rather than a date. A launch film is posted for weeks and a
  // stamp on it only ever gets older; the symbol is the thing a viewer has to
  // still know after the video stops.
  document.getElementById('stamp').textContent = ${JSON.stringify(SYMBOL)};
  document.getElementById('bar').style.width = (100 * Math.min(1, t / SECONDS)).toFixed(2) + '%';

  if (t < 3.4) {
    // The thesis. Not the logo — a launch film that opens with a mark is asking
    // for attention it has not earned yet, thirteen seconds is short, and this
    // sentence is the entire reason the token exists.
    stage.innerHTML =
      '<div style="display:grid;gap:26px">' +
      line('Card payments assume a human.', 0.25, 'say') +
      line('An agent is not one.', 1.5, 'say said') +
      line(${JSON.stringify(SYMBOL)} + ' is the rail that does not.', 2.6, 'note') +
      '</div>';

  } else if (t < 7.0) {
    // The mechanism, as HTTP actually performs it. Shown rather than described:
    // the audience for this reads status codes, and four real lines carry more
    // than a paragraph claiming the same thing.
    stage.innerHTML =
      // x402 is spelled with a lowercase x. The eyebrow uppercases its contents
      // and turned the protocol's name into something that is not its name.
      line('<span class="eyebrow">Pay per call &mdash; <span style="text-transform:none">x402</span> over HTTP</span>', 3.5) +
      '<div class="wire" style="margin-top:34px">' + WIRE.map(function (row, i) {
        var p = at(3.9 + i * 0.42, 4.5 + i * 0.42);
        return '<div style="opacity:' + p + '">' +
          '<span class="dir">' + row[0] + '</span>' +
          '<span class="code">' + row[1] + '</span>' +
          '<span class="what">' + row[2] + '</span>' +
          '<span class="tail">' + row[3] + '</span></div>';
      }).join('') + '</div>';

  } else if (t < 10.2) {
    // What a credit buys, at the density the product is built at. Six rows and
    // a price each, because the argument is that there is something behind the
    // token, and a list is the shortest proof of it.
    stage.innerHTML =
      line('<span class="eyebrow">' + TOOLS.length + ' of ' + ${PAID_TOOLS.length} + ' paid readings</span>', 7.05) +
      '<div class="rows" style="margin-top:22px">' +
      '<div class="row head"><span>Tool</span><b>Credits</b></div>' +
      TOOLS.map(function (row, i) {
        var p = at(7.35 + i * 0.17, 7.85 + i * 0.17);
        return '<div class="row" style="opacity:' + p + '">' +
          '<span>' + row[0] + '</span><b>' + row[1] + '</b></div>';
      }).join('') + '</div>' +
      '<div style="margin-top:20px">' +
      line('<span class="note">' + ${FREE_TOOLS.length} + ' of ' + ${MCP_TOOLS.length} +
        ' tools stay free. A test enforces that, not a promise.</span>', 9.0) + '</div>';

  } else {
    // Where it launches. Their mark sits under the words rather than beside the
    // wordmark, so this reads as a destination and not as a co-signature.
    //
    // The symbol carries this frame, not the name: the name is already in the
    // corner of every second of the film and the footer, and the one thing a
    // viewer has to still hold after it stops is the ticker.
    var p = at(10.3, 11.3);
    stage.innerHTML =
      '<div style="opacity:' + p + ';transform:translateY(' + (14 - 14 * p).toFixed(2) + 'px);' +
      'display:grid;gap:34px">' +
      '<span class="ticker">' + ${JSON.stringify(SYMBOL)} + '</span>' +
      '<div style="display:grid;gap:18px">' +
      '<span class="eyebrow">Launching on</span>' +
      '<div class="on"><img src="' + LOGO + '" alt=""><b>' + ${JSON.stringify(PLATFORM)} + '</b></div>' +
      '</div></div>';
  }
</script>
</body></html>`;

writeFileSync(`${ROOT}assets/brand/launch.html`, launch, 'utf8');

console.log(`launch.html written (${SECONDS}s at ${FPS}fps)`);
console.log(`frames to render: ${SECONDS * FPS}`);
console.log(`on screen: ${FREE_TOOLS.length} free of ${MCP_TOOLS.length}, ${SHOWN.length} of ${PAID_TOOLS.length} paid`);
// Not on screen, but the caption in docs/BRAND.md quotes it, and a caption and
// a film disagreeing is the failure this whole file exists to prevent.
console.log(`for the caption: ${bundle.watchlist.active} repositories`);
