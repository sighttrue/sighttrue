/**
 * `/token` — what $SGHT is for, on the site rather than on somebody else's.
 *
 * The explanation existed first as a shareable page hosted elsewhere, which is
 * the wrong home for it: a launch that asks people to read about a token on a
 * domain the project does not control has already given away the one thing it
 * was selling, which is that everything here can be checked against files this
 * project publishes.
 *
 * Not a fifth door. The site has four — Findings, Readings, Your stack, Method
 * — and this is reached from Method's "Who pays" band, where a reader who wants
 * to know who funds the instrument is already standing.
 *
 * ## What it may claim
 *
 * Every figure is read from the bundle and the catalogue, and the 402 specimen
 * is produced by the real `paymentRequired`, so what a reader sees is the shape
 * the server sends. It quotes no price, no supply, no return and no revenue,
 * and it never opens with a repository count — the readings that never touch
 * GitHub are the answer to "a GitHub summariser is worth only what GitHub
 * already shows you", and leading with a watchlist size concedes that in the
 * first line.
 */

import { CHAIN_CAIP2, CHAIN_NETWORK } from '../lib/chain.ts';
import { FREE_TOOLS, MCP_TOOLS, PAID_TOOLS, PRICE_BANDS, groups, toolByName } from '../lib/mcp-catalogue.ts';
import { paymentRequired } from '../lib/x402.ts';
import type { IndexBundle } from '../types/bundles.ts';
import type { MetaRecord } from '../types/meta.ts';
import { band, esc, layout } from './render.ts';

const n = (value: number): string => value.toLocaleString('en');

/**
 * The three bands, with the tools that show what each one means.
 *
 * Named here and looked up rather than transcribed with their prices. The
 * pricing page and the server disagreed for weeks the last time a count lived
 * in two places.
 */
const BANDS = [
  {
    credits: PRICE_BANDS.convenience,
    name: 'Restates a public source',
    why: 'The answer exists somewhere public. What is being paid for is not having to go and get it, in a shape an agent can act on.',
    tools: ['typosquat_check', 'registry_health', 'model_withdrawn'],
  },
  {
    credits: PRICE_BANDS.joined,
    name: 'Joins sources nobody joins',
    why: 'Two or three published records, held together. Each half is free to anybody; the join is the work, and nobody else is doing it.',
    tools: ['withdrawn_but_installed', 'runtime_deadlines', 'who_can_publish'],
  },
  {
    credits: PRICE_BANDS.archival,
    name: 'Rests on the archive',
    why: 'Answerable only because the reading was taken and kept, every four hours, for as long as this has been running. It cannot be reconstructed later by anybody who did not start then.',
    tools: ['provider_incidents', 'model_price_history', 'time_to_fix'],
  },
] as const;

/**
 * The five things a token page usually leaves out.
 *
 * Kept as data rather than prose so that adding one is an edit to a list. Each
 * is a limit the rest of the site already enforces somewhere: the free bundles,
 * the reviewed-commit watchlist, the no-wallet-connect rule.
 */
const NOT = [
  [
    'It is not access to the site.',
    'Every page, every bundle and every archive here is free to read and free to download, for anybody, holder or not. Nothing is behind the token and nothing is planned to be.',
  ],
  [
    'It is not a governance token.',
    'Holding it does not vote on the watchlist, the thresholds, or anything else. The watchlist changes by reviewed commit, in public, which is slower and more accountable than a poll.',
  ],
  [
    'It is not a claim on revenue.',
    'It is payment for a service, in the ordinary sense that a token is what the meter reads. No share of anything is attached to holding it.',
  ],
  [
    'There is nothing to connect a wallet to.',
    'This site has no wallet connection and will not get one. A contract address and a copy button is the whole of the interface, by rule.',
  ],
  [
    'It does not make the readings better.',
    'Paid tools are not more accurate than free ones. They are harder to produce. A paid answer carries the same limits as a free one and states them in the same words.',
  ],
] as const;

function bandsHtml(): string {
  return `<div class="price-bands">${BANDS.map((tier) => {
    const rows = tier.tools
      .map((name) => {
        const tool = toolByName(name);
        if (tool === undefined) throw new Error(`token page: no tool named ${name}`);
        return `<li><code>${esc(tool.name)}</code><span>${esc(tool.because)}</span></li>`;
      })
      .join('');

    return `<div class="price-band">
  <div class="price-band-figure">
    <span class="num">${tier.credits}</span>
    <span class="label">credit${tier.credits === 1 ? '' : 's'}</span>
  </div>
  <div class="price-band-body">
    <h3>${esc(tier.name)}</h3>
    <p>${esc(tier.why)}</p>
    <ul class="tool-notes">${rows}</ul>
  </div>
</div>`;
  }).join('')}</div>`;
}

export function renderToken(index: IndexBundle, meta: MetaRecord): string {
  const { incidents, lifecycle, models } = index;

  /**
   * The refusal, from the function that sends it.
   *
   * Placeholders rather than plausible hex. Inventing an address on a page
   * about a token is how somebody ends up sending money to a string that was
   * written for a diagram.
   */
  const specimen = paymentRequired(toolByName('provider_incidents')!, 'https://sighttrue.com', {
    asset: '0xPLACEHOLDER',
    payTo: '0xPLACEHOLDER',
    network: CHAIN_NETWORK,
    pricePerCall: '1000000000000000000',
    decimals: 18,
  });

  const medians = incidents.byProvider
    .filter((row) => row.medianMinutes !== null)
    .slice(0, 5)
    .map(
      (row) =>
        `<tr><td>${esc(row.name)}</td><td class="num">${n(row.count)}</td><td class="num">${n(row.medianMinutes as number)}</td></tr>`,
    )
    .join('');

  const catalogue = groups()
    .map((group) => {
      const free = group.tools.filter((tool) => tool.tier === 'free').length;
      return `<tr><td>${esc(group.group)}</td><td class="num">${group.tools.length}</td><td class="num">${free}</td><td class="num">${group.tools.length - free}</td></tr>`;
    })
    .join('');

  const freeRows = FREE_TOOLS.map(
    (tool) => `<li><code>${esc(tool.name)}</code><span>${esc(tool.description)}</span></li>`,
  ).join('');

  const body = `<section class="hero">
  <h1 class="hero-thesis">A machine cannot open a bank account. <em>It can hold a wallet.</em></h1>
  <p class="hero-sub">
    $SGHT is what this service charges in, so an agent that has never met its operator can still buy
    one answer. <strong>The token does not exist yet</strong> — there is no contract address, no price
    and no supply, and this page quotes none of them. Everything described below is built and readable
    today, and the payment rail refuses to charge anybody until four empty fields are filled.
  </p>
</section>

${band(
  'Why a token at all',
  `<div class="prose method-prose">
  <p>
    An agent has no billing address. It cannot answer a 3-D Secure prompt, cannot open an account, and
    cannot agree to terms on anybody's behalf. Every one of those is load-bearing in card payments and
    none of them has a machine-shaped answer.
  </p>
  <p>
    The workaround the industry settled on is to make the machine borrow a human's credentials: an API
    key, issued to a person, billed to a person's card, pasted into a program. It works, and it means
    every purchase a machine makes has to be arranged in advance by somebody who signed up first.
  </p>
  <p>
    A wallet is the one payment instrument a machine can hold on its own terms. That is the whole of
    the argument, and it is the only claim this project makes for the token.
  </p>
</div>`,
)}

${band(
  'What is being sold',
  `<div class="prose method-prose">
  <p>
    Status pages are current-state instruments. They carry a few months and then the incident is gone,
    and with it the record of how a provider actually behaves — which is the only thing anybody wanted
    from a status page in the first place. This archive has been keeping them:
    <strong>${n(incidents.total)} outages across ${n(incidents.providers)} providers, reaching back
    ${n(incidents.observedDays)} days</strong>, each with the duration the provider itself announced.
  </p>
</div>
<table class="readout">
  <caption>
    Announced durations, median across incidents that published both a start and an end. A median is
    not a promise about the next one, and an incident never given an end time is not counted here.
  </caption>
  <thead><tr><th>Provider</th><th class="num">Incidents</th><th class="num">Median minutes</th></tr></thead>
  <tbody>${medians}</tbody>
</table>
<div class="prose method-prose">
  <p>
    Beside it: <strong>${n(lifecycle.ended)}</strong> release lines already past the date they stop
    receiving security fixes, <strong>${n(lifecycle.approaching)}</strong> more inside the next window,
    and <strong>${n(models.available)}</strong> models with every price change dated. None of that comes
    from a repository host, and none of it can be reconstructed later by anybody who did not start
    collecting when this did.
  </p>
</div>`,
)}

${band(
  'How a payment happens',
  `<div class="prose method-prose">
  <p>
    The protocol is <a href="https://x402.org">x402</a>, HTTP's own answer to being asked for money. The
    server replies <strong>402</strong> with what it wants, the caller pays, and the caller asks again.
    There is no signup step because there is nowhere to sign up to.
  </p>
</div>
<table class="readout wire-readout">
  <caption>Four messages. No account is created at any point, and none is needed.</caption>
  <tbody>
    <tr><td class="wire-dir">&rarr;</td><td class="num">POST</td><td>/api/mcp</td><td class="wire-say">An agent asks for one reading.</td></tr>
    <tr><td class="wire-dir">&larr;</td><td class="num">402</td><td>PAYMENT-REQUIRED</td><td class="wire-say">The price, the asset, the chain, and where to send it.</td></tr>
    <tr><td class="wire-dir">&rarr;</td><td class="num">POST</td><td>PAYMENT-PAYLOAD</td><td class="wire-say">The same request again, carrying the receipt.</td></tr>
    <tr><td class="wire-dir">&larr;</td><td class="num">200</td><td>the reading</td><td class="wire-say">Verified on chain first, twelve confirmations.</td></tr>
  </tbody>
</table>
<div class="prose method-prose">
  <p>
    The refusal is not a wall, it is an invoice. This is what the server sends, rendered here by the
    same function that answers a live request:
  </p>
</div>
<pre class="specimen">{
  "x402Version": ${specimen?.x402Version ?? 1},
  "accepts": [{
    "scheme":      "${esc(specimen?.accepts[0]?.scheme ?? '')}",
    "network":     "${esc(specimen?.accepts[0]?.network ?? '')}",
    "asset":       "0x… no contract yet",
    "payTo":       "0x… no wallet yet",
    "maxAmountRequired": "${esc(specimen?.accepts[0]?.maxAmountRequired ?? '')}",
    "resource":    "${esc(specimen?.accepts[0]?.resource ?? '')}",
    "extensions":  { "chain": { "caip2": "${esc(CHAIN_CAIP2)}" } }
  }]
}</pre>
<div class="prose method-prose">
  <p>
    The CAIP-2 identifier is published because <code>network</code> is a bare word. A caller that has
    never heard of this network can still address it correctly, and a transfer sent to the wrong chain
    does not come back.
  </p>
</div>`,
)}

${band(
  'What a credit costs',
  `<div class="prose method-prose">
  <p>
    Priced by how hard the reading is to get, not by how valuable it might be to you — that second one
    is a guess about your business. Which band a tool sits in is a statement about the work behind the
    answer.
  </p>
</div>
${bandsHtml()}`,
)}

${band(
  `What stays free`,
  `<div class="prose method-prose">
  <p>
    <strong>${n(FREE_TOOLS.length)} of the ${n(MCP_TOOLS.length)} tools</strong> are free and stay free
    — everything needed to decide whether to install a dependency. A test reads the server's own
    dispatch table and fails the build if any of them acquires a price, which is a different kind of
    commitment from a sentence on a page, including this one.
  </p>
</div>
<ul class="tool-notes free-tools">${freeRows}</ul>
<table class="readout">
  <caption>The full catalogue, by what the tools are about. ${n(PAID_TOOLS.length)} are paid.</caption>
  <thead><tr><th>Group</th><th class="num">Tools</th><th class="num">Free</th><th class="num">Paid</th></tr></thead>
  <tbody>${catalogue}</tbody>
</table>`,
)}

${band(
  'What it is not',
  `<ul class="not-list">${NOT.map(
    ([claim, why]) => `<li><strong>${esc(claim)}</strong><span>${esc(why)}</span></li>`,
  ).join('')}</ul>`,
  'The list a token page usually leaves out. Every line here is a limit enforced somewhere else on this site.',
)}

${band(
  'Checking this',
  `<div class="prose method-prose">
  <p>
    None of the above needs to be taken on trust. One command reads the manifest in the current
    directory and reports what is on record, with no account and nothing uploaded:
  </p>
</div>
<pre class="specimen">npx sighttrue check</pre>
<div class="prose method-prose">
  <p>
    Every reading is committed to a <a href="https://github.com/sighttrue/sighttrue">public
    repository</a>, timestamped and append-only, and the bundles behind this page are at
    <a href="/data/index.json">/data/index.json</a>. The free tools answer without payment today, over
    MCP or one GET. If a figure here is wrong, it is wrong against a file anybody can open — which is
    the only version of a claim this project is willing to make.
  </p>
</div>`,
)}`;

  return layout({
    title: 'What $SGHT is for — Sighttrue',
    description:
      'An agent cannot use a credit card. What the token pays for, how the 402 handshake works, what a credit costs, and what the token is not.',
    current: '/method',
    path: '/token',
    index,
    meta,
    body,
  });
}
