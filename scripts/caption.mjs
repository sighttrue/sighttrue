/**
 * The launch copy, with today's figures in it.
 *
 *   node scripts/caption.mjs           # long form, for a platform without a limit
 *   node scripts/caption.mjs --short   # under 280 characters
 *   node scripts/caption.mjs --quote   # the line that carries the article
 *   node scripts/caption.mjs --article # the long-form piece, ready to paste
 *   node scripts/caption.mjs --sheet   # all of it as a page, for checking a paste against
 *
 * ## Why this is a script
 *
 * A caption was written into docs/BRAND.md with "618 outages ... 731 days" in
 * it. Three hours later the daily run committed and the site said 619 and 720,
 * because `observedDays` is measured from the oldest row still held rather than
 * from a fixed start. The caption was already wrong and nothing would ever have
 * told anybody — a post is the one artefact with no build step between writing
 * it and publishing it.
 *
 * So the figures are read at the moment the copy is produced. Run this, copy
 * what it prints, post it.
 *
 * The words themselves live in `src/lib/launch-copy.ts`, which the reference
 * sheet imports as well. A sheet held beside the compose box to check a paste
 * against is worthless if it can disagree with what this prints.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The tool counts come from the catalogue, never from a number typed here. That
// figure has been wrong in two places on two occasions: seven on the pricing
// page against a server answering eight, and eight in the README against 31.
const catalogue = await import('../src/lib/mcp-catalogue.ts');
const { figuresFrom, launchCopy } = await import('../src/lib/launch-copy.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = JSON.parse(readFileSync(`${ROOT}dist/data/index.json`, 'utf8'));

const figures = figuresFrom(bundle, {
  free: catalogue.FREE_TOOLS.length,
  total: catalogue.MCP_TOOLS.length,
});
const copy = launchCopy(figures);

const flag = (name) => process.argv.includes(`--${name}`);

if (flag('sheet')) {
  const { renderSheet } = await import('./lib/sheet.mjs');
  const out = `${ROOT}assets/brand/post-sheet.html`;
  writeFileSync(out, renderSheet(copy, figures, ROOT), 'utf8');
  console.log(`post-sheet.html written — hold it beside the compose box`);
  console.log(`figures: ${figures.incidents} incidents, ${figures.observedDays} days, ${figures.freeTools}/${figures.totalTools} tools`);
} else {
  const text = flag('article')
    ? copy.article
    : flag('quote')
      ? copy.quote
      : flag('short')
        ? copy.brief
        : copy.long;

  process.stdout.write(`${text}\n`);
  process.stderr.write(
    `\n--- ${text.length} characters${flag('short') && text.length > 280 ? '  OVER THE 280 LIMIT' : ''}\n` +
      `--- figures read from dist/data/index.json\n` +
      `--- post it with assets/brand/launch.mp4\n`,
  );
}
