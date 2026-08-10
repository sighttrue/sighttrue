/**
 * Rewrites the figures in README.md from the ledger.
 *
 *   node scripts/readme-figures.mjs           # rewrite in place
 *   node scripts/readme-figures.mjs --check   # exit 1 if it would change
 *
 * ## Why
 *
 * The README is the most-read page this project has and every number in it was
 * typed by hand. An audit found four of them wrong: it advertised eight MCP
 * tools against a server answering thirty-one, 461 provider incidents against
 * 619 held, 518 end-of-life cycles against 519 — and 247 packages by real ship
 * date against 182 measured, which is the bad direction. A README claiming more
 * than the ledger holds is the ordinary way a project starts overstating itself
 * without anybody deciding to.
 *
 * Every other surface here already reads its figures from the bundle: the
 * cards, the film, the token page, the launch caption. This was the last hand-
 * typed one, and it was the one strangers read first.
 *
 * ## How
 *
 * Blocks are marked in the Markdown with HTML comments, so the prose around
 * them stays editable by hand and only the sentences that carry counts are
 * generated. `--check` is what CI runs: a pull request that edits the prose is
 * fine, one that leaves a stale figure behind is not.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { FREE_TOOLS, PAID_TOOLS } = await import('../src/lib/mcp-catalogue.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const README = `${ROOT}README.md`;

const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));
const n = (value) => Number(value).toLocaleString('en');

/** Small counts read better as words in a sentence; the rest stay numerals. */
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four',
];
const word = (value) => WORDS[value] ?? n(value);

/**
 * `staleness` counts packages with a real publish date; `contributors` counts
 * histories read for the bus factor. Both are measured counts rather than
 * ledger sizes, which is why they are read from the summary and not by
 * counting lines in a file.
 */
const blocks = {
  tools: `${word(FREE_TOOLS.length)[0].toUpperCase()}${word(FREE_TOOLS.length).slice(1)} tools free, ${word(PAID_TOOLS.length)} paid.`,

  free: FREE_TOOLS.filter((tool) => tool.name !== 'check_before_install')
    .map((tool) => `\`${tool.name}\``)
    .join(', '),

  scale:
    `One agent watches ${n(bundle.watchlist.active)} open-source repositories and takes\n` +
    `eleven readings, most of which never touch GitHub: ${n(bundle.incidents.total)} provider incidents kept\n` +
    `after their own status pages dropped them, ${n(bundle.lifecycle.dated)} release lines on the end-of-life\n` +
    `clock, ${n(bundle.models.available)} model prices, ${n(bundle.staleness.measured)} packages by real ship date, ${n(bundle.contributors.measured)} commit histories\n` +
    `for the bus factor.`,
};

let text = readFileSync(README, 'utf8');
const before = text;
const missing = [];

for (const [name, body] of Object.entries(blocks)) {
  const open = `<!-- figures:${name} -->`;
  const close = `<!-- /figures:${name} -->`;
  const from = text.indexOf(open);
  const to = text.indexOf(close);
  if (from === -1 || to === -1 || to < from) {
    missing.push(name);
    continue;
  }
  text = text.slice(0, from + open.length) + body + text.slice(to);
}

if (missing.length > 0) {
  console.error(`README is missing marker(s): ${missing.join(', ')}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  if (text === before) {
    console.log('README figures match the ledger.');
    process.exit(0);
  }
  console.error('README figures are stale. Run: node scripts/readme-figures.mjs');
  process.exit(1);
}

if (text === before) {
  console.log('README figures already match the ledger.');
} else {
  writeFileSync(README, text, 'utf8');
  console.log('README figures rewritten.');
}
