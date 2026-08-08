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

import { readFileSync, existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import { fromLines, readingFor } from './lib/docker.mjs';
import { foldName, names, registryFor } from './lib/manifest.mjs';
import { noticesFor } from './lib/notices.mjs';

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
const CANDIDATES = ['package.json', 'requirements.txt', 'Cargo.toml', 'pyproject.toml'];

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
    wanted = names(readFileSync(path, 'utf8'), registry).map((name) => ({ registry, name }));
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

  const rows = [];
  for (const { registry, name } of wanted) {
    const entry = index.packages?.[`${registry}:${foldName(registry, name)}`];

    if (!entry) {
      const near = nearMiss.get(name.toLowerCase());
      if (near && near.canonical.toLowerCase() !== name.toLowerCase()) {
        rows.push({
          registry,
          name,
          entry: { repo: null },
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

    rows.push({ registry, name, entry, notices: noticesFor(registry, name, entry, today) });
  }

  const flagged = rows.filter((row) => row.notices.length > 0);
  // A near-miss row is a name this project does *not* track — it is here
  // because it resembles one. Counting it as tracked would overstate coverage
  // by exactly the packages the reader most needs to know are unknown.
  const tracked = rows.filter((row) => row.entry.repo !== null).length;

  if (asJson) {
    out(
      JSON.stringify(
        {
          read,
          dependencies: wanted.length,
          tracked,
          packages: flagged.map((row) => ({
            package: `${row.registry}:${row.name}`,
            repository: row.entry.repo,
            notices: row.notices,
          })),
          limits: [
            'The watchlist is curated and partial. A package that is not covered is not being judged; it is not tracked.',
            'No field here states whether a package is safe to install.',
            'Readings are taken every four hours at best.',
          ],
        },
        null,
        2,
      ),
    );
  } else {
    out();
    out(
      `${bold(String(wanted.length))} ${wanted.length === 1 ? 'dependency' : 'dependencies'} in ${read}, ${bold(String(tracked))} tracked by Sighttrue.`,
    );
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
        out(row.entry.repo === null ? bold(row.name) : `${bold(row.name)} ${dim(`— ${row.entry.repo}`)}`);
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
