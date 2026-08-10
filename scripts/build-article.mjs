/**
 * The token note: one page explaining what $SGHT is for.
 *
 *   node scripts/build-article.mjs      # writes assets/brand/token.html
 *
 * Generated rather than written by hand for the same reason the cards are. A
 * page explaining a token is read by people deciding whether to hold one, and
 * it is the last place a figure should be able to drift from the ledger it came
 * from. Every number here is read from the bundle or the catalogue at build
 * time; the 402 body is produced by the real `paymentRequired`, so the shape a
 * reader sees is the shape the server actually sends.
 *
 * ## What it may not say
 *
 * No price, no supply, no return, no revenue. The last is the maintainer's
 * standing instruction and the first three are the house rule in BRAND.md under
 * "What never goes in the copy". A page that explains a token is exactly where
 * those rules are most tempting to relax and least affordable to.
 *
 * It also never opens with a repository count. The readings that never touch
 * GitHub are the answer to "a GitHub summariser is worth only what GitHub
 * already shows you", and leading with 417 concedes that in the first line.
 *
 * ## Output
 *
 * Body content only — no doctype, html, head or body element. It is published
 * as an Artifact, which supplies the skeleton, and the fonts are inlined
 * because that renderer blocks every external host.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { MCP_TOOLS, FREE_TOOLS, PAID_TOOLS, PRICE_BANDS, groups, toolByName } = await import(
  '../src/lib/mcp-catalogue.ts'
);
const { paymentRequired } = await import('../src/lib/x402.ts');
const { CHAIN_CAIP2, CHAIN_NETWORK } = await import('../src/lib/chain.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));

const n = (v) => Number(v).toLocaleString('en');
const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A face, inlined. The Artifact renderer refuses every external host. */
function face(file) {
  return readFileSync(`${ROOT}dist/fonts/${file}`).toString('base64');
}
const MONO = face('ibm-plex-mono-latin-400-normal.woff2');
const COND = face('ibm-plex-sans-condensed-latin-600-normal.woff2');
const SERIF = face('ibm-plex-serif-latin-400-normal.woff2');

/**
 * The 402 body, from the function that sends it.
 *
 * The asset and the wallet are placeholders and say so on the page: there is no
 * contract yet, and inventing a plausible-looking address on a page about a
 * token is how a reader ends up sending money to a string somebody made up for
 * a diagram.
 */
const SPECIMEN = paymentRequired(toolByName('provider_incidents'), 'https://sighttrue.com', {
  asset: '0xPLACEHOLDER_NO_CONTRACT_YET',
  payTo: '0xPLACEHOLDER_NO_WALLET_YET',
  network: CHAIN_NETWORK,
  pricePerCall: '1000000000000000000',
  decimals: 18,
});

const incidents = bundle.incidents;
const eol = bundle.lifecycle;
const models = bundle.models;

/** The four providers the archive holds most of, with their announced medians. */
const MEDIANS = incidents.byProvider
  .filter((p) => p.medianMinutes !== null)
  .slice(0, 5)
  .map((p) => ({ name: p.name, count: p.count, median: p.medianMinutes }));

const BANDS = [
  {
    credits: PRICE_BANDS.convenience,
    name: 'Restates a public source',
    why: 'The answer exists somewhere public. What you are paying for is not having to go and get it, in a shape an agent can act on.',
    tools: ['typosquat_check', 'registry_health', 'model_withdrawn'],
  },
  {
    credits: PRICE_BANDS.joined,
    name: 'Joins sources nobody joins',
    why: 'Two or three published records, held together. Each half is free to anybody; the join is the work, and no one else is doing it.',
    tools: ['withdrawn_but_installed', 'runtime_deadlines', 'who_can_publish'],
  },
  {
    credits: PRICE_BANDS.archival,
    name: 'Rests on the archive',
    why: 'Answerable only because the reading was taken and kept, every four hours, for as long as this has been running. It cannot be reconstructed later by anyone who did not start then.',
    tools: ['provider_incidents', 'model_price_history', 'time_to_fix'],
  },
];

const toolRow = (name) => {
  const tool = toolByName(name);
  if (!tool) throw new Error(`build-article: no tool named ${name}`);
  return tool;
};

const bandsHtml = BANDS.map(
  (band) => `<div class="band-row">
  <div class="band-price"><span class="num">${band.credits}</span><span class="unit">credit${band.credits === 1 ? '' : 's'}</span></div>
  <div class="band-body">
    <h3>${esc(band.name)}</h3>
    <p class="prose">${esc(band.why)}</p>
    <ul class="tools">${band.tools
      .map((t) => `<li><code>${esc(toolRow(t).name)}</code><span>${esc(toolRow(t).because)}</span></li>`)
      .join('')}</ul>
  </div>
</div>`,
).join('');

const medianRows = MEDIANS.map(
  (p) => `<tr><td>${esc(p.name)}</td><td class="num">${n(p.count)}</td><td class="num">${n(p.median)}</td></tr>`,
).join('');

const groupRows = groups()
  .map((g) => {
    const free = g.tools.filter((t) => t.tier === 'free').length;
    return `<tr><td>${esc(g.group)}</td><td class="num">${g.tools.length}</td><td class="num">${free}</td><td class="num">${g.tools.length - free}</td></tr>`;
  })
  .join('');

const freeList = FREE_TOOLS.map((t) => `<li><code>${esc(t.name)}</code><span>${esc(t.description)}</span></li>`).join('');

const page = `<title>$SGHT — what the token is for</title>
<style>
  @font-face { font-family: 'Plex Mono'; font-weight: 400; font-display: swap;
    src: url(data:font/woff2;base64,${MONO}) format('woff2'); }
  @font-face { font-family: 'Plex Cond'; font-weight: 600; font-display: swap;
    src: url(data:font/woff2;base64,${COND}) format('woff2'); }
  @font-face { font-family: 'Plex Serif'; font-weight: 400; font-display: swap;
    src: url(data:font/woff2;base64,${SERIF}) format('woff2'); }

  /* One theme, on purpose. The product is dark-only by a decision the
     maintainer made and the instrument brief records; a light variant here
     would be a second identity for the same thing. Every colour is stated
     rather than inherited, so the page holds on any host ground. */
  :root {
    --ground: #121212;
    --raise:  #171717;
    --line:   #262626;
    --rule:   #2c2c2c;
    --ink:    #e8e8e8;
    --muted:  #9e9e9e;
    --dim:    #6b6b6b;
    --figure: #d2e2f4;
    --datum:  #f2857c;
    --measure: 66ch;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--ground);
    color: var(--ink);
    font-family: 'Plex Mono', ui-monospace, monospace;
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .sheet { max-width: 980px; margin: 0 auto; padding: 0 28px 120px; }

  /* Labels are signage: condensed, spaced, quiet. Never a heading's job. */
  .label {
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 13px;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim);
  }

  /* Interpretation is set in the serif and measured values never are. The rule
     the product runs on, so page and product read as one thing. */
  .prose {
    font-family: 'Plex Serif', Georgia, serif; font-size: 18px; line-height: 1.68;
    max-width: var(--measure); color: var(--ink);
  }
  .prose + .prose { margin-top: 18px; }
  .prose em { color: var(--figure); font-style: normal; }

  .num { font-variant-numeric: tabular-nums; color: var(--figure); }

  header.masthead { padding: 76px 0 40px; border-bottom: 1px solid var(--rule); }
  .wm {
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 26px;
    letter-spacing: -0.022em; line-height: 1; display: inline-block; color: var(--ink);
  }
  .wm i { position: relative; font-style: normal; }
  .wm i b { position: absolute; left: -0.10em; right: -0.16em; top: 0.325em;
            height: 2px; background: var(--datum); display: block; }
  .masthead-top { display: flex; justify-content: space-between; align-items: baseline;
                  gap: 20px; flex-wrap: wrap; margin-bottom: 56px; }
  h1 {
    font-family: 'Plex Cond', sans-serif; font-weight: 600;
    font-size: clamp(46px, 8vw, 92px); line-height: 0.98; letter-spacing: -0.025em;
    text-wrap: balance; margin-bottom: 22px;
  }
  .standfirst {
    font-family: 'Plex Serif', Georgia, serif; font-size: clamp(20px, 2.4vw, 26px);
    line-height: 1.45; max-width: 30ch; color: var(--muted);
  }

  /* Stated at the top rather than in a footnote. A reader deciding anything
     needs this before the argument, not after it. */
  .status {
    margin-top: 40px; border-left: 2px solid var(--datum); padding: 4px 0 4px 18px;
    font-size: 14px; color: var(--muted); max-width: 62ch; line-height: 1.6;
  }

  section { padding: 56px 0; border-bottom: 1px solid var(--rule); }
  section > .label { display: block; margin-bottom: 26px; }
  h2 {
    font-family: 'Plex Cond', sans-serif; font-weight: 600;
    font-size: clamp(28px, 3.4vw, 40px); line-height: 1.08; letter-spacing: -0.018em;
    margin-bottom: 22px; text-wrap: balance;
  }
  h3 {
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 20px;
    letter-spacing: -0.005em; margin-bottom: 8px;
  }

  /* The signature: the exchange, as it happens. Wider than the prose column,
     because a wrapped protocol line stops being a protocol line. */
  .wire { margin: 34px 0 0; border-top: 1px solid var(--line); overflow-x: auto; }
  .wire table { border-collapse: collapse; width: 100%; min-width: 620px; font-size: 15px; }
  .wire td { padding: 13px 16px 13px 0; border-bottom: 1px solid var(--line); vertical-align: baseline; }
  .wire .dir { color: var(--dim); width: 26px; }
  .wire .code { color: var(--figure); font-variant-numeric: tabular-nums; width: 62px; }
  .wire .what { color: var(--ink); white-space: nowrap; }
  .wire .say { color: var(--muted); font-family: 'Plex Serif', Georgia, serif; font-size: 15px; }

  /* Reveal in reading order, once, because the order is the content: this is a
     sequence of messages and the second cannot happen before the first. */
  @media (prefers-reduced-motion: no-preference) {
    .wire tr { animation: step 420ms both; }
    .wire tr:nth-child(1) { animation-delay: 60ms; }
    .wire tr:nth-child(2) { animation-delay: 300ms; }
    .wire tr:nth-child(3) { animation-delay: 540ms; }
    .wire tr:nth-child(4) { animation-delay: 780ms; }
    @keyframes step { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  }

  /* Wrapped rather than scrolled. One field in this body is a full sentence and
     it ran off the right edge, which reads as a broken layout rather than as a
     line somebody can drag — and the value being cut off was the description of
     what the reader would be paying for. */
  pre {
    margin-top: 26px; background: var(--raise); border: 1px solid var(--line);
    padding: 20px 22px; font-size: 14px; line-height: 1.62; color: var(--muted);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }
  pre b { color: var(--figure); font-weight: 400; }
  pre i { color: var(--datum); font-style: normal; }

  table.readout { border-collapse: collapse; width: 100%; margin-top: 28px; font-size: 15px; }
  table.readout caption {
    text-align: left; color: var(--dim); font-size: 13px; padding-bottom: 12px; line-height: 1.5;
  }
  table.readout th {
    text-align: left; font-family: 'Plex Cond', sans-serif; font-weight: 600;
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim);
    padding: 0 14px 10px 0; border-bottom: 1px solid var(--rule);
  }
  table.readout th.num, table.readout td.num { text-align: right; padding-right: 0; }
  table.readout td { padding: 11px 14px 11px 0; border-bottom: 1px solid var(--line); }
  .scroll { overflow-x: auto; }

  .band-row { display: grid; grid-template-columns: 128px 1fr; gap: 28px;
              padding: 30px 0; border-bottom: 1px solid var(--line); }
  .band-row:last-child { border-bottom: 0; }
  .band-price { text-align: right; }
  .band-price .num { font-family: 'Plex Cond', sans-serif; font-weight: 600;
                     font-size: 52px; line-height: 1; display: block; }
  .band-price .unit { font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 12px;
                      letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim); }
  .band-body .prose { font-size: 17px; }

  ul.tools { list-style: none; margin-top: 16px; display: grid; gap: 9px; }
  ul.tools li { display: grid; grid-template-columns: minmax(180px, 220px) 1fr; gap: 16px;
                font-size: 14px; align-items: baseline; }
  ul.tools code { color: var(--figure); }
  ul.tools span { color: var(--muted); font-family: 'Plex Serif', Georgia, serif; font-size: 15px; }

  ul.plain { list-style: none; display: grid; gap: 20px; margin-top: 26px; max-width: var(--measure); }
  ul.plain li { border-left: 1px solid var(--line); padding-left: 18px; }
  ul.plain strong { font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 17px;
                    display: block; margin-bottom: 5px; color: var(--ink); }
  ul.plain span { font-family: 'Plex Serif', Georgia, serif; font-size: 16px;
                  line-height: 1.6; color: var(--muted); }

  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 30px 40px; margin-top: 30px; }

  a { color: var(--figure); text-decoration-color: color-mix(in srgb, var(--figure) 35%, transparent);
      text-underline-offset: 3px; }
  a:hover { text-decoration-color: var(--figure); }
  a:focus-visible { outline: 2px solid var(--datum); outline-offset: 3px; }

  footer { padding: 56px 0 0; color: var(--dim); font-size: 14px;
           display: flex; justify-content: space-between; gap: 20px; flex-wrap: wrap; }

  @media (max-width: 640px) {
    .sheet { padding: 0 20px 80px; }
    .band-row { grid-template-columns: 1fr; gap: 14px; }
    .band-price { text-align: left; }
    .band-price .num { font-size: 40px; display: inline; }
    .band-price .unit { margin-left: 8px; }
    ul.tools li { grid-template-columns: 1fr; gap: 3px; }
  }
</style>

<div class="sheet">

<header class="masthead">
  <div class="masthead-top">
    <span class="wm">sigh<i>tt<b></b></i>rue</span>
    <span class="label">Token note &middot; ${esc(SPECIMEN.accepts[0].network)} &middot; ${esc(CHAIN_CAIP2)}</span>
  </div>
  <h1>What&nbsp;$SGHT is&nbsp;for</h1>
  <p class="standfirst">A machine cannot open a bank account. It can hold a wallet. That is the whole of the idea.</p>
  <p class="status">
    <strong style="color:var(--ink)">The token does not exist yet.</strong> There is no contract address,
    no price, and no supply to quote, and this page quotes none of them. Everything described below is
    built and readable today; the payment rail is configured with four empty fields and refuses to charge
    anybody until they are filled.
  </p>
</header>

<section>
  <span class="label">The problem</span>
  <h2>Card rails assume a human at the far end</h2>
  <p class="prose">
    An agent has no billing address. It cannot answer a 3-D Secure prompt, cannot open an account, and
    cannot agree to terms on anyone's behalf. Every one of those is load-bearing in card payments, and
    none of them has a machine-shaped answer.
  </p>
  <p class="prose">
    The workaround the industry has settled on is to make the machine borrow a human's credentials: an
    API key, issued to a person, billed to a person's card, pasted into a program. It works, and it means
    every purchase a machine makes has to be arranged in advance by somebody who signed up first.
  </p>
  <p class="prose">
    <em>A wallet is the one payment instrument a machine can hold on its own terms.</em> $SGHT is what
    this service charges in, so an agent that has never met its operator can still buy one answer.
  </p>
</section>

<section>
  <span class="label">What is being sold</span>
  <h2>Readings that are not on GitHub, and mostly not anywhere</h2>
  <p class="prose">
    Status pages are current-state instruments. They carry a few months and then the incident is gone,
    and with it the record of how a provider actually behaves — which is the only thing anybody wanted
    from a status page in the first place.
  </p>
  <p class="prose">
    This archive has been keeping them. <em>${n(incidents.total)} outages across
    ${n(incidents.providers)} providers, reaching back ${n(incidents.observedDays)} days</em>, each with
    the duration the provider itself announced.
  </p>
  <div class="scroll">
  <table class="readout">
    <caption>
      Announced durations, median across incidents that published both a start and an end. A median is
      not a promise about the next one, and an incident that was never given an end time is not counted
      here at all.
    </caption>
    <thead><tr><th>Provider</th><th class="num">Incidents</th><th class="num">Median minutes</th></tr></thead>
    <tbody>${medianRows}</tbody>
  </table>
  </div>
  <p class="prose" style="margin-top:34px">
    Beside it: <em>${n(eol.ended)}</em> release lines that are already past the date they stop receiving
    security fixes, <em>${n(eol.approaching)}</em> more inside the next window, and
    <em>${n(models.available)}</em> models with every price change dated. None of that comes from a
    repository host, and none of it can be reconstructed later by somebody who did not start collecting
    when this did.
  </p>
</section>

<section>
  <span class="label">How a payment happens</span>
  <h2>Four messages, no account</h2>
  <p class="prose">
    The protocol is <a href="https://x402.org">x402</a> — HTTP's own answer to being asked for money.
    The server replies <em>402</em> with what it wants, the caller pays, and the caller asks again. There
    is no signup step because there is nowhere to sign up to.
  </p>
  <div class="wire">
    <table>
      <tbody>
        <tr><td class="dir">&rarr;</td><td class="code">POST</td><td class="what">/api/mcp</td><td class="say">An agent asks for one reading.</td></tr>
        <tr><td class="dir">&larr;</td><td class="code">402</td><td class="what">PAYMENT-REQUIRED</td><td class="say">The price, the asset, the chain, and where to send it.</td></tr>
        <tr><td class="dir">&rarr;</td><td class="code">POST</td><td class="what">PAYMENT-PAYLOAD</td><td class="say">The same request again, carrying the receipt.</td></tr>
        <tr><td class="dir">&larr;</td><td class="code">200</td><td class="what">the reading</td><td class="say">Verified on chain first, twelve confirmations.</td></tr>
      </tbody>
    </table>
  </div>
  <p class="prose" style="margin-top:34px">
    The refusal is not a wall, it is an invoice. This is what the server actually sends, produced here by
    the same function that answers a live request:
  </p>
<pre>HTTP/1.1 <b>402</b> Payment Required

{
  "x402Version": ${SPECIMEN.x402Version},
  "accepts": [{
    "scheme":      "${esc(SPECIMEN.accepts[0].scheme)}",
    "network":     "${esc(SPECIMEN.accepts[0].network)}",
    "asset":       <i>"0x… no contract yet"</i>,
    "payTo":       <i>"0x… no wallet yet"</i>,
    "maxAmountRequired": "${esc(SPECIMEN.accepts[0].maxAmountRequired)}",
    "resource":    "${esc(SPECIMEN.accepts[0].resource)}",
    "description": "${esc(SPECIMEN.accepts[0].description)}",
    "extensions":  { "chain": { "caip2": "${esc(CHAIN_CAIP2)}" } }
  }]
}</pre>
  <p class="prose" style="margin-top:26px">
    The CAIP-2 identifier is there because <code>network</code> is a bare word. A caller that has never
    heard of this network can still address it correctly, and a transfer sent to the wrong chain does not
    come back.
  </p>
</section>

<section>
  <span class="label">What a credit costs</span>
  <h2>Priced by how hard the reading is to get</h2>
  <p class="prose">
    Not by how valuable it might be to you — that is a guess about your business. Three bands, and which
    band a tool sits in is a statement about the work behind the answer.
  </p>
  ${bandsHtml}
</section>

<section>
  <span class="label">What stays free</span>
  <h2>${n(FREE_TOOLS.length)} of the ${n(MCP_TOOLS.length)} tools, enforced by a test</h2>
  <p class="prose">
    Everything needed to decide whether to install a dependency is free and stays free. A test reads the
    server's own dispatch table and fails the build if any of these acquires a price — which is a
    different kind of commitment from a sentence on a page, including this one.
  </p>
  <ul class="tools" style="margin-top:26px">${freeList}</ul>
  <div class="scroll">
  <table class="readout">
    <caption>The full catalogue, by what the tools are about.</caption>
    <thead><tr><th>Group</th><th class="num">Tools</th><th class="num">Free</th><th class="num">Paid</th></tr></thead>
    <tbody>${groupRows}</tbody>
  </table>
  </div>
</section>

<section>
  <span class="label">What it is not</span>
  <h2>The list that is usually missing</h2>
  <ul class="plain">
    <li><strong>It is not access to the site.</strong><span>Every page, every bundle and every archive on sighttrue.com is free to read and free to download, for anybody, holder or not. Nothing there is behind the token and nothing is planned to be.</span></li>
    <li><strong>It is not a governance token.</strong><span>Holding it does not vote on the watchlist, the thresholds, or anything else. The watchlist changes by reviewed commit, in public, which is a slower and more accountable mechanism than a poll.</span></li>
    <li><strong>It is not a claim on revenue.</strong><span>It is payment for a service, in the ordinary sense that a token is what the meter reads. No share of anything is attached to holding it.</span></li>
    <li><strong>There is nothing to connect a wallet to.</strong><span>The site has no wallet connection and will not get one. The contract address and a copy button is the whole of the interface, by rule.</span></li>
    <li><strong>It does not make the readings better.</strong><span>Paid tools are not more accurate than free ones. They are harder to produce. A paid answer carries the same limits as a free one and states them in the same words.</span></li>
  </ul>
</section>

<section>
  <span class="label">Checking this</span>
  <h2>None of the above needs to be taken on trust</h2>
  <div class="cols">
    <div>
      <h3>Run it</h3>
      <p class="prose" style="font-size:16px">One command, no account, nothing uploaded. It reads the manifest in the current directory and reports what is on record.</p>
      <pre style="margin-top:16px">npx sighttrue check</pre>
    </div>
    <div>
      <h3>Read the ledger</h3>
      <p class="prose" style="font-size:16px">
        Every reading is committed to a public repository, timestamped and append-only. The commit
        history is the audit trail, and it is the argument.
      </p>
      <pre style="margin-top:16px">github.com/sighttrue/sighttrue</pre>
    </div>
  </div>
  <p class="prose" style="margin-top:34px">
    The free tools answer without payment today, over MCP or one GET. If the figures on this page are
    wrong, they are wrong against a file anybody can open — which is the only version of a claim this
    project is willing to make.
  </p>
</section>

<footer>
  <span>sighttrue.com</span>
  <span>Launching on Virtuals &middot; ${esc(CHAIN_CAIP2)}</span>
</footer>

</div>
`;

writeFileSync(`${ROOT}assets/brand/token.html`, page, 'utf8');

console.log(`token.html written — ${(page.length / 1024).toFixed(0)}KB with fonts inlined`);
console.log(`quoted: ${n(incidents.total)} incidents, ${n(incidents.providers)} providers, ${n(incidents.observedDays)} days`);
console.log(`        ${n(eol.ended)} ended cycles, ${n(models.available)} models`);
console.log(`        ${FREE_TOOLS.length} free of ${MCP_TOOLS.length}, ${PAID_TOOLS.length} paid`);
console.log(`no repository count on the page: ${!page.includes(String(bundle.watchlist.active))}`);
