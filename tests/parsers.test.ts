import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// @ts-expect-error — plain ESM with no types, which is the point of it.
import { names as sharedNames } from '../cli/lib/manifest.mjs';
// @ts-expect-error — same.
import { noticesFor as esmNotices, registryUrl as esmUrl } from '../cli/lib/notices.mjs';
import { parseManifest } from '../src/lib/manifests.ts';
import { registryFacts, WATCHABLE_IDS } from '../src/lib/registries-table.ts';
import { noticesFor as tsNotices } from '../src/lib/verdict.ts';
import { STACK_SCRIPT } from '../src/site/stack.ts';

const ESM_NOTICES = fileURLToPath(new URL('../cli/lib/notices.mjs', import.meta.url));
const ACTION_CHECK = fileURLToPath(new URL('../action/check.mjs', import.meta.url));

const esmRegistryUrl = esmUrl as (registry: string, name: string) => string;

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
 * Three became two when the CLI arrived: it and the Action now import the same
 * `cli/lib/manifest.mjs`, rather than the CLI becoming a fourth copy on the day
 * that fix shipped. The browser one stays separate because a page has no
 * imports, so its agreement is asserted here instead.
 *
 * The same applies to the notices those readings turn into — one set in
 * TypeScript for the endpoint and the MCP tool, one in ESM for the CLI, and a
 * test that they say the same thing rather than a hope.
 *
 * Where they differ on purpose, this says so out loud rather than passing.
 */

/**
 * The reader the CLI and the Action both import. Plain ESM with no build step,
 * because it runs on a stranger's Node and on whatever a runner happens to
 * have — the TypeScript one needs 22.18 to be stripped at run time.
 */
const actionNames = sharedNames as (text: string, registry: string) => string[];

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

const GEMFILE = [
  "source 'https://rubygems.org'",
  "ruby '3.3.0'",
  '',
  "gem 'rails', '~> 7.1.0'",
  'gem "puma", ">= 5.0"',
  "gem 'sidekiq' # background jobs",
  '',
  'group :development, :test do',
  "  gem 'rubocop', require: false",
  'end',
  '',
  'gemspec',
  'gem name_from_a_variable',
].join('\n');

const COMPOSER = JSON.stringify({
  name: 'acme/store',
  require: {
    php: '^8.2',
    'ext-mbstring': '*',
    'composer-runtime-api': '^2.2',
    'laravel/framework': '^11.0',
    'guzzlehttp/guzzle': '^7.8',
  },
  'require-dev': { 'phpunit/phpunit': '^11.0' },
  autoload: { 'psr-4': { 'App\\': 'app/' } },
});

describe('the readers agree on a Gemfile', () => {
  it('reads the gems and none of the directives', () => {
    // `source`, `ruby`, `group ... do`, `end` and `gemspec` are Bundler's own
    // vocabulary. A Gemfile is a Ruby program, not a list.
    expect(actionNames(GEMFILE, 'gem').sort()).toEqual(['puma', 'rails', 'rubocop', 'sidekiq']);
    expect(fromStack(GEMFILE)).toEqual(['puma', 'rails', 'rubocop', 'sidekiq']);
    expect(Object.keys(parseManifest('Gemfile', GEMFILE)).sort()).toEqual([
      'puma',
      'rails',
      'rubocop',
      'sidekiq',
    ]);
  });

  it('skips a gem whose name is computed rather than guessing at it', () => {
    // `gem name_from_a_variable` names a gem this cannot know. Guessing would
    // put a stranger's readings in somebody's pull request.
    for (const found of [actionNames(GEMFILE, 'gem'), fromStack(GEMFILE)]) {
      expect(found).not.toContain('name_from_a_variable');
    }
  });
});

describe('the readers agree on a composer.json', () => {
  it('drops the platform constraints, which are not packages', () => {
    // `php`, `ext-mbstring` and `composer-runtime-api` sit in the same block as
    // real dependencies and describe the machine. Packagist has never heard of
    // any of them, and a lookup would report whatever it found under the name.
    for (const found of [actionNames(COMPOSER, 'packagist'), fromStack(COMPOSER)]) {
      expect(found).not.toContain('php');
      expect(found).not.toContain('ext-mbstring');
      expect(found).not.toContain('composer-runtime-api');
    }
  });

  it('is never read as a package.json', () => {
    // Both are JSON and nothing but the key names tells them apart. Read as npm
    // this would report an empty manifest, which looks exactly like a clean one.
    expect(actionNames(COMPOSER, 'packagist').sort()).toEqual([
      'guzzlehttp/guzzle',
      'laravel/framework',
      'phpunit/phpunit',
    ]);
    expect(fromStack(COMPOSER)).toEqual([
      'guzzlehttp/guzzle',
      'laravel/framework',
      'phpunit/phpunit',
    ]);
  });

  it('reads require only where the reading is about shipping', () => {
    // Same split as package.json: the collector's claim is about what a project
    // ships, so phpunit does not belong in it.
    expect(Object.keys(parseManifest('composer.json', COMPOSER)).sort()).toEqual([
      'guzzlehttp/guzzle',
      'laravel/framework',
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

describe('every copy of a registry fact agrees with the table', () => {
  /** A map lifted out of a file that cannot import one. */
  function mapIn(source: string, name: string): Record<string, string> {
    // The closing brace sits at whatever indentation its file uses — column
    // zero in the ESM files, two spaces inside the page's script.
    const body = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\n *\\};)`).exec(source)?.[1];
    if (body === undefined) throw new Error(`${name} not found — has it been renamed?`);
    return new Function(`return ${body.slice(0, -1)}`)() as Record<string, string>;
  }

  const copies: [string, Record<string, string>][] = [
    ['cli/lib/notices.mjs', mapIn(readFileSync(ESM_NOTICES, 'utf8'), 'OSV_ECOSYSTEM')],
    ['action/check.mjs', mapIn(readFileSync(ACTION_CHECK, 'utf8'), 'OSV_ECOSYSTEM')],
    ['the /stack page', mapIn(STACK_SCRIPT, 'OSV_ECOSYSTEM')],
  ];

  it('spells every OSV ecosystem the way the table does', () => {
    // A query with the wrong ecosystem comes back empty rather than failing, so
    // a copy that drifted reports "no advisories" about a package that has
    // them. That is the worst available way to be wrong here, and it is silent.
    for (const [where, copy] of copies) {
      for (const [registry, ecosystem] of Object.entries(copy)) {
        expect(registryFacts(registry)?.osv, `${where} names ${registry}`).toBe(ecosystem);
      }
    }
  });

  it('never links a package to a registry that does not publish it', () => {
    // `registryUrl` in the CLI used to end in a bare fallback to crates.io, so
    // the day RubyGems opened, a `gem:` reading printed a link to a crates.io
    // page that has never existed — in somebody's build log, under this
    // project's name.
    for (const id of WATCHABLE_IDS) {
      const url = esmRegistryUrl(id, id === 'maven' ? 'com.acme:widget' : 'widget');
      expect(url, `${id} has no page in the CLI`).not.toBe('');
      expect(url).toBe(registryFacts(id)?.page(id === 'maven' ? 'com.acme:widget' : 'widget'));
    }
  });

  it('refuses to invent a page for a registry it does not know', () => {
    expect(esmRegistryUrl('hex', 'phoenix')).toBe('');
  });
});

describe('the notices say the same thing in both languages', () => {
  const entry = {
    repo: 'axios/axios',
    installs: 58_000_000,
    scorecard: 6.2,
    scoredAt: '2026-07-27',
    advisories: 12,
    license: 'BUSL-1.1',
    archived: true,
    pushedAt: '2026-08-05T00:00:00Z',
    lastPublish: '2019-01-01',
    version: '1.7.4',
    withdrawn: 'no longer maintained',
    installScripts: 'postinstall',
    bytes: 209_281,
    funding: null,
    busFactor: 3,
    topShare: 0.42,
  };

  const TODAY = '2026-08-09';

  it('produces identical notices for the same reading', () => {
    // The CLI cannot import the TypeScript one — it runs on a stranger's Node
    // with no build step — so the two exist separately and this is what stops
    // them drifting into telling different stories about one package.
    const ts = tsNotices({ registry: 'npm', name: 'axios' }, entry, TODAY);
    const esm = esmNotices('npm', 'axios', entry, TODAY) as typeof ts;

    expect(esm).toEqual(ts);
  });

  it('agrees that an ordinary package has nothing to report', () => {
    const plain = { ...entry, withdrawn: null, archived: false, installScripts: null, license: 'MIT', advisories: 0, lastPublish: '2026-08-01' };

    expect(tsNotices({ registry: 'npm', name: 'axios' }, plain, TODAY)).toEqual([]);
    expect(esmNotices('npm', 'axios', plain, TODAY)).toEqual([]);
  });
});

/**
 * The registry readers exist twice — once in `cli/lib/registry.mjs` for the
 * command line and once inside the `/stack` page's script, which cannot import
 * it because it is a string served to a browser. Neither can see the other, so
 * this is what holds them together.
 *
 * Two of these endpoints are traps that only spring in one of the two places.
 * crates.io refuses a request with no user agent, which a browser always sends
 * and a bare fetch does not; and Packagist serves CORS on `packagist.org` but
 * not on the `repo.packagist.org` mirror its own tooling uses. Picking the
 * mirror works everywhere except the browser, which is the half nobody tests.
 */
describe('the two registry readers call the same endpoints', () => {
  const cli = readFileSync(new URL('../cli/lib/registry.mjs', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/site/stack.ts', import.meta.url), 'utf8');

  const hosts = (source: string) =>
    [...source.matchAll(/https:\/\/([a-z0-9.-]+)\//g)]
      .map((m) => m[1])
      .filter((host) => host !== 'sighttrue.com' && host !== 'api.osv.dev');

  it('reads the same six registries from the same hosts', () => {
    const wanted = [
      'registry.npmjs.org',
      'pypi.org',
      'crates.io',
      'rubygems.org',
      'packagist.org',
      'api.nuget.org',
    ];

    for (const host of wanted) {
      expect(hosts(cli), `cli is missing ${host}`).toContain(host);
      expect(hosts(page), `the stack page is missing ${host}`).toContain(host);
    }
  });

  it('never reaches for the Packagist mirror, which serves no CORS', () => {
    // 200 to curl, blocked in a browser. The failure is invisible in every test
    // that does not run one.
    //
    // Matched as a URL rather than as a string: the comment above the reader
    // names the mirror in order to explain why it is not used, and a bare
    // `toContain` failed on the explanation.
    expect(hosts(page)).not.toContain('repo.packagist.org');
    expect(hosts(cli)).not.toContain('repo.packagist.org');
  });

  it('caps how many it will look up, and by the same number', () => {
    const cap = (source: string) => /MAX_(?:LOOKUPS|LIVE)\s*=\s*(\d+)/.exec(source)?.[1];

    expect(cap(cli)).toBe('60');
    expect(cap(page)).toBe('60');
  });
});
