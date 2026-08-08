import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parseManifest } from '../src/lib/manifests.ts';
import { STACK_SCRIPT } from '../src/site/stack.ts';

/**
 * Three readers, one manifest.
 *
 * The same `Cargo.toml` is read by the Action in somebody's CI, by the page in
 * their browser, and by `parseManifest` behind the collector and the
 * pull-request bot. They are three separate implementations, and they have to
 * be: the Action is plain ESM run by whatever Node is on the runner, the page
 * is a string of JavaScript with no build step, and only the third is
 * TypeScript this project can import. Sharing the code is not available, so
 * agreeing has to be checked instead.
 *
 * It was not being checked, and two of them were wrong. A Cargo.toml is
 * `key = value` on every line, so a reader that skips the table headers reports
 * `name = "my-app"` under [package] as a dependency called `name` — and
 * crates.io has a real crate called `name`, so the lookup would have shown a
 * stranger's readings under it in somebody else's build log. The page also lost
 * `flask[async]>=3.0` entirely, which is the quieter failure: a dependency that
 * simply does not appear in the readout.
 *
 * Where they differ on purpose, this says so out loud rather than passing.
 */

const ACTION = fileURLToPath(new URL('../action/check.mjs', import.meta.url));

/** The Action's reader, lifted out of a module that runs on import. */
const actionNames = new Function(
  `${/function names\(text, registry\) \{[\s\S]*?\n\}/.exec(readFileSync(ACTION, 'utf8'))?.[0] ?? ''}; return names;`,
)() as (text: string, registry: string) => string[];

/** The page's reader, lifted out of the script it ships as. */
const stackNames = new Function(
  `${/function names\(text\) \{[\s\S]*?\n  \}/.exec(STACK_SCRIPT)?.[0] ?? ''}; return names;`,
)() as (text: string) => Map<string, { shown: string; range: string }>;

function fromStack(text: string): string[] {
  return [...stackNames(text).values()].map((entry) => entry.shown).sort();
}

const CARGO = [
  '[package]',
  'name = "my-app"',
  'version = "0.1.0"',
  'edition = "2021"',
  '',
  '[dependencies]',
  'serde = "1.0"',
  'tokio = { version = "1.40", features = ["full"] }',
  '',
  '[dev-dependencies]',
  'criterion = "0.5"',
  '',
  '[profile.release]',
  'lto = true',
].join('\n');

const REQUIREMENTS = [
  '-r base.txt',
  '--index-url https://example.test/simple',
  '# a comment',
  'requests==2.31.0',
  'flask[async]>=3.0',
  'httpx',
].join('\n');

describe('the readers agree on a Cargo.toml', () => {
  it('never invents a dependency out of a table that is not one', () => {
    // `name`, `version`, `edition` and `lto` are keys in [package] and
    // [profile.release]. None of them is a crate this project is looking at.
    expect(actionNames(CARGO, 'crates')).not.toContain('name');
    expect(fromStack(CARGO)).not.toContain('name');
    expect(actionNames(CARGO, 'crates')).not.toContain('lto');
    expect(fromStack(CARGO)).not.toContain('lto');
  });

  it('reads the same crates in the Action and in the browser', () => {
    expect(actionNames(CARGO, 'crates').sort()).toEqual(['criterion', 'serde', 'tokio']);
    expect(fromStack(CARGO)).toEqual(['criterion', 'serde', 'tokio']);
  });

  it('still reads a fragment somebody pasted without its headers', () => {
    // The page exists for people pasting part of a file. Requiring a
    // [dependencies] header would fail exactly them.
    expect(fromStack('serde = "1.0"\ntokio = { version = "1.40" }')).toEqual(['serde', 'tokio']);
  });
});

describe('the readers agree on a requirements.txt', () => {
  it('keeps a dependency that declares extras', () => {
    // `flask[async]>=3.0` vanished from the page's readout entirely, which is
    // the failure that looks like a clean result.
    expect(actionNames(REQUIREMENTS, 'pypi')).toContain('flask');
    expect(fromStack(REQUIREMENTS)).toContain('flask');
  });

  it('reads the same packages everywhere, directives included', () => {
    // `-r base.txt` is an include, not a package called base.
    expect(actionNames(REQUIREMENTS, 'pypi').sort()).toEqual(['flask', 'httpx', 'requests']);
    expect(fromStack(REQUIREMENTS)).toEqual(['flask', 'httpx', 'requests']);
    expect(Object.keys(parseManifest('requirements.txt', REQUIREMENTS)).sort()).toEqual([
      'flask',
      'httpx',
      'requests',
    ]);
  });
});

describe('where they differ, they differ on purpose', () => {
  const PACKAGE_JSON = JSON.stringify({
    dependencies: { axios: '^1.6.0' },
    devDependencies: { vitest: '^4.0.0' },
    peerDependencies: { typescript: '^5' },
    scripts: { build: 'tsc' },
  });

  it('reads runtime dependencies only where the reading is about shipping', () => {
    // The collector's claim is "the projects watched here are moving toward X",
    // and dev tooling churns with fashion. The pull-request bot inherits that
    // scope and says so in its own comment.
    expect(Object.keys(parseManifest('package.json', PACKAGE_JSON))).toEqual(['axios']);
  });

  it('reads everything installed where the reading is about a supply chain', () => {
    // A devDependency runs on the machine that installs it, so a check about
    // what you are pulling in has to see it.
    expect(actionNames(PACKAGE_JSON, 'npm').sort()).toEqual(['axios', 'typescript', 'vitest']);
    expect(fromStack(PACKAGE_JSON)).toEqual(['axios', 'typescript', 'vitest']);
  });

  it('never reads a script as a dependency', () => {
    for (const found of [actionNames(PACKAGE_JSON, 'npm'), fromStack(PACKAGE_JSON)]) {
      expect(found).not.toContain('build');
    }
  });
});
