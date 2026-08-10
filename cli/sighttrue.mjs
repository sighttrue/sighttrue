#!/usr/bin/env node
/**
 * `npx sighttrue check`
 *
 * The site waits for people to arrive. This runs where they already are, in a
 * terminal, against a manifest they already have, and it needs no account, no
 * key and no service — it reads one published static file and does the rest
 * locally.
 *
 * The manifest never leaves the machine. Names are matched against a file
 * fetched from sighttrue.com; nothing is uploaded, which is both the honest
 * architecture and the reason this costs nothing to run.
 *
 * Exit 0 unless asked otherwise. A checker that fails builds by default is a
 * checker people uninstall on the second failure, and everything here is a
 * reading rather than a rule — `--fail-on` is how somebody chooses to make one
 * of them a rule.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { fromLines, readingFor } from './lib/docker.mjs';
import { foldName, names, registryFor } from './lib/manifest.mjs';
import { noticesFor } from './lib/notices.mjs';
import { positionOf } from './lib/positions.mjs';
import { MAX_LOOKUPS, READABLE, readMissing } from './lib/registry.mjs';

const ENDPOINT = (process.env.SIGHTTRUE_ENDPOINT || 'https://sighttrue.com').replace(/\/$/, '');

/**
 * How this stops, instead of `process.exit`.
 *
 * On Windows, exiting while stdout still has a pending asynchronous write
 * aborts the process with a libuv assertion and an exit code of 127 — the
 * output appears, the command looks like it worked, and CI records a failure
 * nobody can explain. Setting `process.exitCode` and letting Node drain
 * naturally is the only way to be sure the last line was actually written.
 */
class Stop extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}

/** Looked for in this order, which is the order a project is most likely to have one. */
const CANDIDATES = [
  'package.json',
  'requirements.txt',
  'Cargo.toml',
  'pyproject.toml',
  'composer.json',
  'Gemfile',
  'gems.rb',
];

const COLOUR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const dim = (text) => (COLOUR ? `[2m${text}[0m` : text);
const bold = (text) => (COLOUR ? `[1m${text}[0m` : text);

function out(line = '') {
  process.stdout.write(`${line}\n`);
}

function usage() {
  out(`sighttrue — dated readings on what you are about to install

  npx sighttrue check [manifest]     read a manifest and report what is on record
  npx sighttrue docker [Dockerfile]  read the FROM lines: support window and rebuild date
  npx sighttrue <registry>:<name>    read one package, e.g. npm:axios
  npx sighttrue skill                teach your coding agent to check before it installs

Options
  --fail-on=a,b     exit 1 on any of: withdrawn, archived, advisories, source-available,
                    runs-on-install, long-unpublished, near-miss-name,
                    stale-base-image, runtime-ended, runtime-ending
  --json            machine-readable output
  --help

Readings come from ${ENDPOINT}. Nothing you read is ever uploaded.`);
}

function findManifest(argument, candidates = CANDIDATES) {
  if (argument) {
    const path = resolve(argument);
    if (!existsSync(path)) {
      out(`No file at ${path}.`);
      throw new Stop(2);
    }
    return path;
  }

  for (const name of candidates) {
    if (existsSync(name)) return resolve(name);
  }

  out(`Nothing to read here. Looked for: ${candidates.join(', ')}.`);
  out(dim('Pass one explicitly, for example: npx sighttrue check path/to/package.json'));
  throw new Stop(2);
}

async function load(path) {
  try {
    const response = await fetch(`${ENDPOINT}${path}`, {
      headers: { 'user-agent': 'sighttrue-cli' },
    });
    if (!response.ok) throw new Error(`${response.status} from ${ENDPOINT}`);
    return await response.json();
  } catch (error) {
    // A network problem is not a finding. Saying so and exiting 0 is the only
    // behaviour that leaves this installed in somebody's pipeline.
    out(`Readings unavailable (${error.message}). Nothing checked, nothing failed.`);
    throw new Stop(0);
  }
}

/**
 * The whole command, so every stop goes through one place.
 *
 * Node drains stdout before it exits on its own; `process.exit` does not wait
 * for it, and on Windows that aborts with a libuv assertion and code 127.
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    usage();
    throw new Stop(0);
  }

  const asJson = args.includes('--json');
  const failOn = new Set(
    (args.find((a) => a.startsWith('--fail-on='))?.slice('--fail-on='.length) ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );

  const positional = args.filter((a) => !a.startsWith('-'));
  const today = new Date().toISOString().slice(0, 10);

  // ---- skill ------------------------------------------------------------------

  // Installs the agent instruction rather than describing it.
  //
  // The order today is: hear about this, decide to add the MCP server, then
  // remember to call it while choosing a dependency. Three steps, each losing
  // people. A skill collapses them to one — installed once, the agent calls it
  // without anybody deciding to again.
  if (positional[0] === 'skill') {
    const target = join(process.cwd(), '.claude', 'skills', 'sighttrue');
    mkdirSync(join(target, 'references'), { recursive: true });

    // A lean body and five references loaded on demand, rather than one long
    // document. A skill that tries to cover every workflow in its own text
    // either never fires or fires constantly, because the description is what
    // routes it — and a body carrying five subjects has to describe all five.
    const from = (name) => new URL(`./skill/${name}`, import.meta.url);
    writeFileSync(join(target, 'SKILL.md'), readFileSync(from('SKILL.md'), 'utf8'));

    const references = ['dependencies', 'images', 'runtimes', 'models', 'providers'];
    for (const name of references) {
      writeFileSync(
        join(target, 'references', `${name}.md`),
        readFileSync(from(`references/${name}.md`), 'utf8'),
      );
    }

    out(`Installed to ${join('.claude', 'skills', 'sighttrue')}`);
    out(dim(`One instruction and ${references.length} references, read only when they apply.`));
    out(dim('Your agent will take a reading before adopting a dependency, base image,'));
    out(dim('runtime, model or provider. Nothing was sent anywhere.'));
    return;
  }

  // ---- docker -----------------------------------------------------------------

  if (positional[0] === 'docker') {
    const path = findManifest(positional[1], ['Dockerfile', 'dockerfile']);
    const ecosystem = await load('/data/ecosystem.json');
    const eol = await load('/data/eol.json');

    const lines = fromLines(readFileSync(path, 'utf8'));
    const readings = lines.map((entry) =>
      readingFor(entry, ecosystem.baseImages ?? [], eol.products ?? [], today),
    );
    const flagged = readings.filter((row) => row.notices.length > 0);

    if (asJson) {
      out(JSON.stringify({ read: basename(path), images: readings }, null, 2));
    } else {
      out();
      out(
        `${bold(String(lines.length))} base ${lines.length === 1 ? 'image' : 'images'} in ${basename(path)}.`,
      );
      out();
      if (flagged.length === 0) {
        out('Nothing on record for any of them.');
        out(dim('Images outside the fifteen tracked here report nothing either way.'));
      } else {
        for (const row of flagged) {
          out(`${bold(row.reference)}`);
          for (const notice of row.notices) {
            out(`  • ${notice.statement}`);
            out(`    ${dim(notice.source)}`);
          }
          out();
        }
      }
      out(dim(`Readings from ${ENDPOINT}. Your Dockerfile was not uploaded.`));
    }

    const broken = flagged.flatMap((row) => row.notices.filter((n) => failOn.has(n.kind)));
    throw new Stop(broken.length > 0 ? 1 : 0);
  }

  // ---- packages ---------------------------------------------------------------

  const index = await load('/data/stack-index.json');

  /** registry:name given directly, rather than a file. */
  const single = positional.find((a) => /^(npm|pypi|crates):/.test(a));

  let wanted = [];
  let read = '';

  if (single) {
    const cut = single.indexOf(':');
    wanted = [{ registry: single.slice(0, cut), name: single.slice(cut + 1) }];
    read = single;
  } else {
    const path = findManifest(positional[0] === 'check' ? positional[1] : positional[0]);
    const registry = registryFor(path);
    if (registry === null) {
      out(`${basename(path)} is not a manifest this reads.`);
      throw new Stop(2);
    }
    const source = readFileSync(path, 'utf8');
    // The line, so somebody can jump straight to it rather than search a file
    // they did not write. Absent for a single package asked about by name.
    wanted = names(source, registry).map((name) => ({
      registry,
      name,
      at: positionOf(source, registry, name),
    }));
    read = basename(path);
  }

  /**
   * Names one edit away from a package this project tracks.
   *
   * Read only for names that are *not* themselves tracked — a dependency the
   * watchlist knows is the real thing, whatever it resembles. The claim is
   * existence and distance and nothing else: this name exists on the registry and
   * is one character from that one. It is not an accusation, most near-miss names
   * are innocent, and the wording has to stay that way.
   */
  const nearMiss = new Map();
  for (const row of (await load('/data/ecosystem.json')).nearMissNames ?? []) {
    nearMiss.set(row.name.toLowerCase(), row);
  }

  /**
   * Everything the published index does not hold, read from its own registry.
   *
   * The index carries 186 packages and a real manifest draws from millions.
   * Measured against the projects this watches, 3% of their dependencies had a
   * reading and more than half the projects got nothing at all — a checker that
   * answers "nothing on record" to most of what it is shown is not a checker.
   *
   * It costs this project nothing: the request goes from the reader's machine
   * to the registry that published the package, which is where the name came
   * from. No server here is involved and the manifest still never moves.
   */
  const missing = wanted.filter(
    ({ registry, name }) =>
      READABLE.includes(registry) && !index.packages?.[`${registry}:${foldName(registry, name)}`],
  );
  const { readings: live, skipped } = await readMissing(missing);

  const rows = [];
  for (const { registry, name, at } of wanted) {
    const entry =
      index.packages?.[`${registry}:${foldName(registry, name)}`] ??
      live.get(`${registry}:${name}`);

    if (!entry) {
      const near = nearMiss.get(name.toLowerCase());
      if (near && near.canonical.toLowerCase() !== name.toLowerCase()) {
        rows.push({
          registry,
          name,
          entry: { repo: null },
          at,
          notices: [
            {
              kind: 'near-miss-name',
              statement: `This name is ${near.distance === 1 ? 'one character' : `${near.distance} characters`} from ${near.canonical}, which is a package tracked here. Both exist on the registry. Worth confirming which one you meant.`,
              source: `${ENDPOINT}/${registry}/${near.canonical}`,
            },
          ],
        });
      }
      continue;
    }

    rows.push({ registry, name, entry, at, notices: noticesFor(registry, name, entry, today) });
  }

  const flagged = rows.filter((row) => row.notices.length > 0);
  // A near-miss row is a name this project does *not* track — it is here
  // because it resembles one. Counting it as tracked would overstate coverage
  // by exactly the packages the reader most needs to know are unknown.
  // Two different things, counted apart. A ledger reading is archived and can
  // be checked tomorrow; a live one was taken from the registry a moment ago,
  // passed through no carry-forward rule, and is in no file. Reporting them as
  // one number would claim an audit trail for half of them that does not exist.
  const fromLedger = rows.filter((row) => row.entry.repo !== null).length;
  const fromRegistry = rows.filter((row) => row.entry.live === true).length;
  const tracked = fromLedger + fromRegistry;

  if (asJson) {
    out(
      JSON.stringify(
        {
          read,
          dependencies: wanted.length,
          tracked,
          fromLedger,
          fromRegistry,
          packages: flagged.map((row) => ({
            package: `${row.registry}:${row.name}`,
            repository: row.entry.repo,
            // Which kind of reading this is, on every row rather than once in a
            // footnote a caller can drop.
            source: row.entry.live === true ? 'registry, read just now' : 'published ledger',
            notices: row.notices,
          })),
          limits: [
            'The watchlist is curated and partial. A package that is not covered is not being judged; it is not tracked.',
            'A reading marked "registry, read just now" was taken live and is in no published file. It cannot be checked again later, and it carries no scorecard, advisory count or bus factor — those need the ledger.',
            'No field here states whether a package is safe to install.',
            'Readings from the ledger are taken every four hours at best.',
          ],
        },
        null,
        2,
      ),
    );
  } else {
    out();
    // The two sources named apart. One is archived and checkable tomorrow; the
    // other was taken from the registry a moment ago and is in no file. Rolling
    // them into a single count would claim an audit trail for half of them.
    const where =
      fromRegistry === 0
        ? ''
        : fromLedger === 0
          ? ` — ${fromRegistry} read from the registry just now`
          : ` — ${fromLedger} from the published readings, ${fromRegistry} read from the registry just now`;

    out(
      `${bold(String(wanted.length))} ${wanted.length === 1 ? 'dependency' : 'dependencies'} in ${read}, ${bold(String(tracked))} with a reading${where}.`,
    );
    if (skipped > 0) {
      out(dim(`${skipped} more were not looked up; this stops at ${MAX_LOOKUPS} registry reads.`));
    }
    out();

    if (flagged.length === 0) {
      out('Nothing on record for any of them.');
      out(
        dim(
          'That is not a statement that they are safe — it means these particular facts are absent,',
        ),
      );
      out(dim('from a curated watchlist, in readings taken up to four hours ago.'));
    } else {
      for (const row of flagged) {
        const where = row.at ? dim(` ${read}:${row.at.line + 1}`) : '';
        const from = row.entry.repo === null ? '' : dim(` — ${row.entry.repo}`);
        out(`${bold(row.name)}${from}${where}`);
        for (const notice of row.notices) {
          out(`  • ${notice.statement}`);
          out(`    ${dim(notice.source)}`);
        }
        out();
      }
    }

    out(dim(`Readings from ${ENDPOINT}. Your manifest was not uploaded.`));
  }

  const failed = flagged.flatMap((row) => row.notices.filter((n) => failOn.has(n.kind)));
  if (failed.length > 0) {
    if (!asJson) out(`\nFailing on ${failed.length} of: ${[...failOn].join(', ')}`);
    throw new Stop(1);
  }

  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  if (error instanceof Stop) process.exitCode = error.code;
  else {
    out(`sighttrue failed: ${error.message}`);
    process.exitCode = 2;
  }
}
