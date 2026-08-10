/**
 * The launch copy as a page, to hold beside the compose box.
 *
 * Every block is exactly what `caption.mjs` prints — both call the same module
 * — so a paste can be checked against this rather than against a memory of it.
 * Each block has its own copy button, and the character count beside it is
 * measured from the string rather than asserted.
 *
 * Body content only: no doctype, html, head or body element. It is published as
 * an Artifact, which supplies the skeleton, and the fonts are inlined because
 * that renderer blocks every external host.
 */

import { readFileSync } from 'node:fs';

import { CROSSBAR_TOP } from './wordmark.mjs';

const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const n = (value) => Number(value).toLocaleString('en');

/** A face, inlined. The Artifact renderer refuses every external host. */
const face = (root, file) => readFileSync(`${root}dist/fonts/${file}`).toString('base64');

/** One block: a heading, what it is for, the text, and a button that copies it. */
function block(id, kind, name, note, text, meta) {
  return `<section class="block">
  <div class="block-head">
    <div>
      <span class="label">${esc(kind)}</span>
      <h2>${esc(name)}</h2>
      <p class="note">${note}</p>
    </div>
    <div class="block-act">
      <span class="count">${esc(meta)}</span>
      <button type="button" class="copy" data-for="${esc(id)}">Copy</button>
    </div>
  </div>
  <pre id="${esc(id)}" class="text">${esc(text)}</pre>
</section>`;
}

export function renderSheet(copy, figures, root) {
  const mono = face(root, 'ibm-plex-mono-latin-400-normal.woff2');
  const cond = face(root, 'ibm-plex-sans-condensed-latin-600-normal.woff2');
  const serif = face(root, 'ibm-plex-serif-latin-400-normal.woff2');

  const overLimit = copy.quote.length > 280;

  return `<title>Launch post sheet — $SGHT</title>
<style>
  @font-face { font-family: 'Plex Mono'; font-weight: 400; font-display: swap;
    src: url(data:font/woff2;base64,${mono}) format('woff2'); }
  @font-face { font-family: 'Plex Cond'; font-weight: 600; font-display: swap;
    src: url(data:font/woff2;base64,${cond}) format('woff2'); }
  @font-face { font-family: 'Plex Serif'; font-weight: 400; font-display: swap;
    src: url(data:font/woff2;base64,${serif}) format('woff2'); }

  /* One theme, deliberately. This is an operating document for one person at a
     compose box, and it matches the product it is about. Every colour is stated
     rather than inherited, so it holds on any host ground. */
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
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--ground);
    color: var(--ink);
    font-family: 'Plex Mono', ui-monospace, monospace;
    font-size: 15px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  .sheet { max-width: 940px; margin: 0 auto; padding: 0 24px 100px; }

  .label {
    display: block;
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 12px;
    letter-spacing: 0.18em; text-transform: uppercase; color: var(--dim);
    margin-bottom: 6px;
  }

  header.top { padding: 60px 0 30px; border-bottom: 1px solid var(--rule); }
  /* The mark's own type, with 'Plex Cond' as this page names the face. Its
     crossbar height comes from lib/wordmark.mjs rather than being written out
     again — it was written out again in four builders and was wrong in all of
     them. */
  .wm { font-family: 'Plex Cond', sans-serif; font-weight: 600;
        letter-spacing: -0.022em; line-height: 1; white-space: nowrap;
        display: inline-block; text-transform: none; }
  .wm-tt { position: relative; }
  .wm-tt i { position: absolute; left: -0.10em; right: -0.16em;
             top: ${CROSSBAR_TOP}em; display: block; }
  h1 {
    font-family: 'Plex Cond', sans-serif; font-weight: 600;
    font-size: clamp(32px, 5vw, 52px); line-height: 1.02; letter-spacing: -0.022em;
    margin: 34px 0 16px; text-wrap: balance;
  }
  .standfirst {
    font-family: 'Plex Serif', Georgia, serif; font-size: 18px; line-height: 1.6;
    color: var(--muted); max-width: 62ch;
  }

  /* The order is the instruction. These are two posts, and the second has to
     follow the first within minutes or the film travels with no link. */
  ol.plan {
    list-style: none; counter-reset: step; margin: 34px 0 0;
    display: grid; gap: 14px;
  }
  ol.plan li {
    counter-increment: step;
    display: grid; grid-template-columns: 34px 1fr; gap: 16px;
    align-items: baseline; padding-bottom: 14px; border-bottom: 1px solid var(--line);
  }
  ol.plan li::before {
    content: counter(step);
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 22px;
    color: var(--figure); font-variant-numeric: tabular-nums;
  }
  ol.plan b { font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 17px; }
  ol.plan span {
    display: block; font-family: 'Plex Serif', Georgia, serif; font-size: 15px;
    line-height: 1.6; color: var(--muted); margin-top: 3px;
  }
  ol.plan code {
    display: inline-block; margin-top: 5px; background: var(--raise);
    border: 1px solid var(--line); padding: 3px 8px; font-size: 13px; color: var(--figure);
  }

  .block { padding: 40px 0 0; }
  .block-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 24px; flex-wrap: wrap; padding-bottom: 14px;
  }
  .block-head h2 {
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 26px;
    letter-spacing: -0.012em; line-height: 1.1;
  }
  .block-head .note {
    font-family: 'Plex Serif', Georgia, serif; font-size: 15px; line-height: 1.6;
    color: var(--muted); max-width: 58ch; margin-top: 6px;
  }
  .block-act { display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
  .count {
    font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .count.over { color: var(--datum); }

  .copy {
    font-family: 'Plex Cond', sans-serif; font-weight: 600; font-size: 12px;
    letter-spacing: 0.16em; text-transform: uppercase;
    background: none; color: var(--ink);
    border: 1px solid var(--rule); padding: 7px 16px; cursor: pointer;
  }
  .copy:hover { border-color: var(--figure); color: var(--figure); }
  .copy:focus-visible { outline: 2px solid var(--datum); outline-offset: 2px; }
  .copy[data-done='1'] { border-color: var(--figure); color: var(--figure); }

  /* The text as it will be pasted. Wrapped, never scrolled: a block being
     checked character by character must not hide a line off the right. */
  .text {
    background: var(--raise); border: 1px solid var(--line);
    border-left: 2px solid var(--datum);
    padding: 20px 22px; font-family: 'Plex Mono', monospace; font-size: 14px;
    line-height: 1.68; color: var(--ink);
    white-space: pre-wrap; overflow-wrap: anywhere;
  }

  table.readout { border-collapse: collapse; width: 100%; margin-top: 20px; font-size: 14px; }
  table.readout th {
    text-align: left; font-family: 'Plex Cond', sans-serif; font-weight: 600;
    font-size: 12px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--dim);
    padding: 0 14px 10px 0; border-bottom: 1px solid var(--rule);
  }
  table.readout td { padding: 10px 14px 10px 0; border-bottom: 1px solid var(--line); }
  table.readout .num { text-align: right; padding-right: 0; font-variant-numeric: tabular-nums;
                       color: var(--figure); }

  ul.checks { list-style: none; display: grid; gap: 12px; margin-top: 22px; max-width: 66ch; }
  ul.checks li {
    display: grid; grid-template-columns: 18px 1fr; gap: 12px; align-items: baseline;
    font-family: 'Plex Serif', Georgia, serif; font-size: 15px; line-height: 1.6;
    color: var(--muted);
  }
  ul.checks li::before { content: '—'; color: var(--dim); font-family: 'Plex Mono', monospace; }
  ul.checks strong { color: var(--ink); font-family: 'Plex Cond', sans-serif; font-weight: 600; }

  hr { border: 0; border-top: 1px solid var(--rule); margin: 46px 0 0; }

  footer { padding: 40px 0 0; color: var(--dim); font-size: 13px; line-height: 1.7; }

  @media (max-width: 620px) {
    .sheet { padding: 0 18px 70px; }
    .block-head { flex-direction: column; gap: 14px; }
  }
</style>

<div class="sheet">

<header class="top">
  <span class="wm" style="font-size:24px"><span>sigh</span><span class="wm-tt">tt<i style="background:var(--datum);height:2px"></i></span><span>rue</span></span>
  <h1>Launch post sheet</h1>
  <p class="standfirst">
    Every block below is exactly what <code>node scripts/caption.mjs</code> prints, from the same
    module, so a paste can be checked against this rather than against a memory of it. The figures
    were read from the ledger when this page was written &mdash; if you post on a later day, run the
    command again first.
  </p>

  <ol class="plan">
    <li>
      <div>
        <b>Post the film. No text.</b>
        <span>It burns the wordmark, the ticker, the domain and the handle into every frame, so a
        silent post still names all four.</span>
        <code>assets\\brand\\launch.mp4</code>
      </div>
    </li>
    <li>
      <div>
        <b>Quote it, within minutes.</b>
        <span>A post with no text has no searchable words and no link. Until the quote lands, the
        film is travelling on its own.</span>
      </div>
    </li>
  </ol>
</header>

${block(
  'quote',
  'Post 2',
  'The quote',
  'Goes above the article, quoting the film. One job: make somebody open it.',
  copy.quote,
  `${n(copy.quote.length)} characters${overLimit ? ' — over 280' : ' — fits 280'}`,
)}

${block(
  'title',
  'Post 2',
  'Article title',
  'The headline. It states the figure rather than promising one.',
  copy.articleTitle,
  `${n(copy.articleTitle.length)} characters`,
)}

${block(
  'article',
  'Post 2',
  'Article body',
  'Lines beginning ## are headings — select the line and choose Heading in the editor. Articles need X Premium+; without it, quote the film with the text above and a link to sighttrue.com/token, which carries the same piece on your own domain.',
  copy.article,
  `${n(copy.article.length)} characters`,
)}

${block(
  'brief',
  'Spare',
  'Caption, short',
  'If you change your mind and put a caption on the film after all.',
  copy.brief,
  `${n(copy.brief.length)} characters${copy.brief.length > 280 ? ' — over 280' : ' — fits 280'}`,
)}

<hr>

<section class="block">
  <span class="label">The figures in it</span>
  <h2 style="font-family:'Plex Cond',sans-serif;font-weight:600;font-size:26px">Every number above, and where it came from</h2>
  <table class="readout">
    <thead><tr><th>Reading</th><th class="num">Today</th></tr></thead>
    <tbody>
      <tr><td>Days the incident archive reaches back</td><td class="num">${n(figures.observedDays)}</td></tr>
      <tr><td>Outages held</td><td class="num">${n(figures.incidents)}</td></tr>
      <tr><td>Providers</td><td class="num">${n(figures.providers)}</td></tr>
      <tr><td>Release lines past end-of-life</td><td class="num">${n(figures.ended)}</td></tr>
      <tr><td>Release lines crossing it soon</td><td class="num">${n(figures.approaching)}</td></tr>
      <tr><td>Models with dated prices</td><td class="num">${n(figures.models)}</td></tr>
      <tr><td>Packages by real ship date</td><td class="num">${n(figures.shipDated)}</td></tr>
      <tr><td>Commit histories for the bus factor</td><td class="num">${n(figures.histories)}</td></tr>
      <tr><td>Tools free of the total</td><td class="num">${n(figures.freeTools)} / ${n(figures.totalTools)}</td></tr>
    </tbody>
  </table>
</section>

<section class="block">
  <span class="label">Before you press post</span>
  <h2 style="font-family:'Plex Cond',sans-serif;font-weight:600;font-size:26px">What none of it says</h2>
  <ul class="checks">
    <li><strong>No price, no supply, no return.</strong> None of the three appears anywhere above, and none should be added in a reply.</li>
    <li><strong>No revenue.</strong> Not on the site, not in the copy.</li>
    <li><strong>No repository count in the opening.</strong> It leads with the archive, because a watchlist size is a fact about this project rather than about the reader.</li>
    <li><strong>Nothing called safe, unsafe or recommended.</strong> This project measures none of those.</li>
    <li><strong>Every figure is checkable.</strong> If somebody disputes one, the answer is a file at sighttrue.com/data/index.json, not an argument.</li>
  </ul>
</section>

<footer>
  Generated by <code>node scripts/caption.mjs --sheet</code>. The words live in
  src/lib/launch-copy.ts, which the terminal output imports as well &mdash; a sheet that could
  disagree with the thing it references would be worse than none.
</footer>

</div>

<script>
  // Copy the block, say so, and put the label back. The button is the only
  // interactive thing on the page and it should confirm without a dialogue.
  document.querySelectorAll('.copy').forEach(function (button) {
    button.addEventListener('click', function () {
      var target = document.getElementById(button.dataset.for);
      if (!target) return;
      navigator.clipboard.writeText(target.textContent).then(function () {
        button.textContent = 'Copied';
        button.dataset.done = '1';
        setTimeout(function () {
          button.textContent = 'Copy';
          delete button.dataset.done;
        }, 1600);
      }, function () {
        button.textContent = 'Select it';
      });
    });
  });
</script>
`;
}
