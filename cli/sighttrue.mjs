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

import { foldName, names, registryFor } from './lib/manifest.mjs';
import { noticesFor } from './lib/notices.mjs';

const ENDPOINT = (process.env.SIGHTTRUE_ENDPOINT || 'https://sighttrue.com').replace(/\/$/, '');

/** Looked for in this order, which is the order a project is most likely to have one. */
const CANDIDATES = ['package.json', 'requirements.txt', 'Cargo.toml', 'pyproject.toml'];

const COLOUR = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
const dim = (text) => (COLOUR ? `[2m${text}[0m` : text);
const bold = (text) => (COLOUR ? `[1m${text}[0m` : text);

function out(line = '') {
  process.stdout.write(`${line}\n`);
}

function usage() {
  out(`sighttrue — dated readings on the dependencies you are about to install

  npx sighttrue check [manifest]     read a manifest and report what is on record
  npx sighttrue <registry>:<name>    read one package, e.g. npm:axios

Options
  --fail-on=a,b     exit 1 on any of: withdrawn, archived, advisories, source-available,
                    runs-on-install, long-unpublished
  --json            machine-readable output
  --help

Readings come from ${ENDPOINT}. Your manifest is never uploaded.`);
}

function findManifest(argument) {
  if (argument) {
    const path = resolve(argument);
    if (!existsSync(path)) {
      out(`No file at ${path}.`);
      process.exit(2);
    }
    return path;
  }

  for (const name of CANDIDATES) {
    if (existsSync(name)) return resolve(name);
  }

  out('No package.json, requirements.txt, Cargo.toml or pyproject.toml here.');
  out(dim('Pass one explicitly: npx sighttrue check path/to/package.json'));
  process.exit(2);
}

async function loadIndex() {
  try {
    const response = await fetch(`${ENDPOINT}/data/stack-index.json`, {
      headers: { 'user-agent': 'sighttrue-cli' },
    });
    if (!response.ok) throw new Error(`${response.status} from ${ENDPOINT}`);
    return await response.json();
  } catch (error) {
    // A network problem is not a finding. Saying so and exiting 0 is the only
    // behaviour that leaves this installed in somebody's pipeline.
    out(`Readings unavailable (${error.message}). Nothing checked, nothing failed.`);
    process.exit(0);
  }
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  usage();
  process.exit(0);
}

const asJson = args.includes('--json');
const failOn = new Set(
  (args.find((a) => a.startsWith('--fail-on='))?.slice('--fail-on='.length) ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean),
);

const positional = args.filter((a) => !a.startsWith('-'));
const index = await loadIndex();
const today = new Date().toISOString().slice(0, 10);

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
    process.exit(2);
  }
  wanted = names(readFileSync(path, 'utf8'), registry).map((name) => ({ registry, name }));
  read = basename(path);
}

const rows = [];
for (const { registry, name } of wanted) {
  const entry = index.packages?.[`${registry}:${foldName(registry, name)}`];
  if (!entry) continue;
  rows.push({ registry, name, entry, notices: noticesFor(registry, name, entry, today) });
}

const flagged = rows.filter((row) => row.notices.length > 0);

if (asJson) {
  out(
    JSON.stringify(
      {
        read,
        dependencies: wanted.length,
        tracked: rows.length,
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
    `${bold(String(wanted.length))} ${wanted.length === 1 ? 'dependency' : 'dependencies'} in ${read}, ${bold(String(rows.length))} tracked by Sighttrue.`,
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
      out(`${bold(row.name)} ${dim(`— ${row.entry.repo}`)}`);
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
  process.exit(1);
}
