/**
 * Manifest selection and parsing.
 *
 * Pure: given a language and a file's text, return the dependency set. The
 * network side lives in the collector.
 *
 * Scope is deliberately narrow. This reads one manifest per repository, chosen
 * from the language GitHub already reported, and it reads it from the watchlist
 * only. It never searches GitHub globally — the Code Search API is capped at
 * ten requests a minute, and the claim this supports is "the repositories we
 * watch are moving toward X", not "the world is". The narrower claim is the
 * defensible one.
 */

/** Language to the single manifest worth fetching for it. */
const MANIFEST_BY_LANGUAGE: Record<string, string> = {
  javascript: 'package.json',
  typescript: 'package.json',
  vue: 'package.json',
  svelte: 'package.json',
  rust: 'Cargo.toml',
  go: 'go.mod',
  python: 'pyproject.toml',
  ruby: 'Gemfile',
  php: 'composer.json',
};

export function manifestPathFor(language: string | null): string | null {
  if (language === null) return null;
  return MANIFEST_BY_LANGUAGE[language.toLowerCase()] ?? null;
}

interface PackageJson {
  dependencies?: Record<string, string>;
}

/**
 * Runtime dependencies only.
 *
 * devDependencies churn with tooling fashion and would drown the signal; what
 * a project ships with is the migration claim worth making.
 */
function parsePackageJson(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as PackageJson;
    return parsed.dependencies ?? {};
  } catch {
    return {};
  }
}

/** `[dependencies]` in Cargo.toml, both bare versions and table form. */
function parseCargoToml(text: string): Record<string, string> {
  const deps: Record<string, string> = {};
  let inside = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inside = line === '[dependencies]';
      continue;
    }
    if (!inside || line === '' || line.startsWith('#')) continue;

    const match = /^([\w-]+)\s*=\s*(.+)$/.exec(line);
    if (match === null) continue;

    const value = (match[2] as string).trim();
    const version = /version\s*=\s*"([^"]+)"/.exec(value)?.[1] ?? /^"([^"]+)"/.exec(value)?.[1];
    deps[match[1] as string] = version ?? value.slice(0, 40);
  }

  return deps;
}

/** `require` directives in go.mod, block and single-line forms. */
function parseGoMod(text: string): Record<string, string> {
  const deps: Record<string, string> = {};
  let inBlock = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('require (')) {
      inBlock = true;
      continue;
    }
    if (inBlock && line === ')') {
      inBlock = false;
      continue;
    }

    const body = inBlock ? line : line.startsWith('require ') ? line.slice(8) : '';
    if (body === '' || body.startsWith('//')) continue;

    const match = /^(\S+)\s+(\S+)/.exec(body);
    if (match !== null) deps[match[1] as string] = match[2] as string;
  }

  return deps;
}

/** PEP 621 `[project] dependencies`, and Poetry's table form. */
function parsePyproject(text: string): Record<string, string> {
  const deps: Record<string, string> = {};

  const pep621 = /dependencies\s*=\s*\[([\s\S]*?)\]/.exec(text);
  if (pep621 !== null) {
    for (const raw of (pep621[1] as string).split(',')) {
      const quoted = /"([^"]+)"|'([^']+)'/.exec(raw);
      if (quoted === null) continue;
      const spec = (quoted[1] ?? quoted[2]) as string;
      const name = /^[A-Za-z0-9._-]+/.exec(spec)?.[0];
      if (name !== undefined) deps[name] = spec.slice(name.length).trim() || '*';
    }
  }

  const poetry = /\[tool\.poetry\.dependencies\]([\s\S]*?)(?:\n\[|$)/.exec(text);
  if (poetry !== null) {
    for (const raw of (poetry[1] as string).split(/\r?\n/)) {
      const match = /^([A-Za-z0-9._-]+)\s*=\s*(.+)$/.exec(raw.trim());
      if (match === null) continue;
      deps[match[1] as string] = (match[2] as string).replace(/["']/g, '').slice(0, 40);
    }
  }

  return deps;
}

/**
 * requirements.txt, which is a format only by convention.
 *
 * Read strictly rather than forgivingly: a line has to begin with a name and be
 * followed by a version specifier, a marker, or nothing. Everything else is
 * skipped, including the `-r`, `-e` and `--hash` directives, URLs, and paths.
 * Nothing here is the collector's input — this exists for the pull-request bot,
 * where a misread line becomes a comment on somebody else's work.
 */
function parseRequirements(text: string): Record<string, string> {
  const deps: Record<string, string> = {};

  for (const raw of text.split(/\r?\n/)) {
    // A `#` inside a URL fragment cannot appear on a line this accepts, because
    // a line with a URL on it has no bare name at the front.
    const line = (raw.split('#')[0] ?? '').trim();
    if (line === '' || line.startsWith('-')) continue;

    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([=<>!~].*)?$/.exec(line);
    if (match === null) continue;

    deps[match[1] as string] = (match[3] ?? '*').trim();
  }

  return deps;
}

/**
 * Composer's `require`, which is runtime by the format's own definition.
 *
 * Platform constraints are dropped. `php`, `ext-mbstring` and
 * `composer-runtime-api` sit in the same block as real dependencies but
 * describe the machine, and every one of them is spelled without a slash —
 * which is the rule Packagist itself uses, since a published name is always
 * `vendor/package`.
 */
function parseComposerJson(text: string): Record<string, string> {
  const deps: Record<string, string> = {};

  try {
    const parsed = JSON.parse(text) as { require?: Record<string, string> };
    for (const [name, range] of Object.entries(parsed.require ?? {})) {
      if (name.includes('/')) deps[name.toLowerCase()] = String(range);
    }
  } catch {
    return {};
  }

  return deps;
}

/**
 * A Gemfile, which is a Ruby program rather than a data format.
 *
 * Read strictly for that reason: only a `gem` call with a quoted first argument
 * counts. Anything computed — `gem name` where name is a variable, or a loop —
 * is skipped rather than guessed at, because this feeds the pull-request bot
 * and a guess there becomes a comment on somebody else's work.
 */
function parseGemfile(text: string): Record<string, string> {
  const deps: Record<string, string> = {};

  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split('#')[0] ?? '').trim();
    const match = /^gem\s+["']([A-Za-z0-9._-]+)["']\s*(?:,\s*["']([^"']+)["'])?/.exec(line);
    if (match === null) continue;
    deps[(match[1] as string).toLowerCase()] = match[2] ?? '*';
  }

  return deps;
}

export function parseManifest(path: string, text: string): Record<string, string> {
  if (path === 'package.json') return parsePackageJson(text);
  if (path === 'Cargo.toml') return parseCargoToml(text);
  if (path === 'go.mod') return parseGoMod(text);
  if (path === 'pyproject.toml') return parsePyproject(text);
  if (path === 'requirements.txt') return parseRequirements(text);
  if (path === 'composer.json') return parseComposerJson(text);
  if (path === 'Gemfile' || path === 'gems.rb') return parseGemfile(text);
  return {};
}

export interface DependencyDiff {
  added: string[];
  removed: string[];
  /** Dependencies whose major version moved. Patch churn is not a migration. */
  bumped: { name: string; from: string; to: string }[];
}

/** Leading integer of a version string, ignoring range operators. */
function majorOf(version: string): string | null {
  return /(\d+)/.exec(version.replace(/^[\^~>=<\s]+/, ''))?.[1] ?? null;
}

export function diffDependencies(
  before: Record<string, string>,
  after: Record<string, string>,
): DependencyDiff {
  const added: string[] = [];
  const removed: string[] = [];
  const bumped: DependencyDiff['bumped'] = [];

  for (const name of Object.keys(after).sort()) {
    const previous = before[name];
    if (previous === undefined) {
      added.push(name);
      continue;
    }

    const from = majorOf(previous);
    const to = majorOf(after[name] as string);
    if (from !== null && to !== null && from !== to) {
      bumped.push({ name, from: previous, to: after[name] as string });
    }
  }

  for (const name of Object.keys(before).sort()) {
    if (after[name] === undefined) removed.push(name);
  }

  return { added, removed, bumped };
}
