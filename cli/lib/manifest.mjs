/**
 * One dependency-free reader for manifests, shared by the CLI and the Action.
 *
 * There were three implementations of this and they disagreed: a Cargo.toml
 * reported a dependency called `name` because `name = "my-app"` under
 * [package] looks exactly like a dependency line, and there is a real crate
 * called `name` on crates.io. A fourth copy would have undone that fix on the
 * day it shipped.
 *
 * It cannot be the TypeScript one. `src/lib/manifests.ts` is stripped by Node
 * at run time, which needs 22.18 or newer — fine for this repository's own
 * scripts, not fine for a package that runs on a stranger's machine or on
 * whatever Node a runner happens to have. So this is plain ESM, no
 * dependencies, no build step, and `tests/parsers.test.ts` asserts it agrees
 * with the others rather than trusting that it does.
 *
 * Deliberately forgiving about formatting and strict about what counts. A real
 * manifest carries comments, ranges and extras; refusing one for not being
 * clean JSON would fail exactly the projects this is for.
 */

/** Which registry a file names packages in, or null when it is not a manifest. */
export function registryFor(path) {
  const name = path.split(/[\\/]/).pop() ?? '';
  if (name === 'package.json') return 'npm';
  if (name === 'requirements.txt' || name === 'pyproject.toml') return 'pypi';
  if (name === 'Cargo.toml') return 'crates';
  return null;
}

/**
 * Package names declared in a manifest.
 *
 * Everything installed, not only runtime dependencies: a devDependency runs on
 * the machine that installs it, so a check about what you are pulling in has to
 * see it. `src/lib/manifests.ts` reads runtime only, on purpose — its claim is
 * about what a project ships, which is a different question.
 */
export function names(text, registry) {
  const found = new Set();

  if (registry === 'npm') {
    try {
      const pkg = JSON.parse(text);
      for (const group of ['dependencies', 'devDependencies', 'peerDependencies']) {
        for (const name of Object.keys(pkg[group] || {})) found.add(name);
      }
    } catch {
      return [];
    }
    return [...found];
  }

  // Which TOML table the reader is inside. Load-bearing for Cargo: every line
  // is `key = value`, so a reader that ignores the headers reports the
  // [package] block as dependencies.
  let table = null;

  for (const raw of text.split(/\r?\n/)) {
    const line = (raw.split('#')[0] ?? '').trim();
    if (!line || line.startsWith('-')) continue;
    if (line.startsWith('[')) {
      table = line.toLowerCase();
      continue;
    }

    if (registry === 'crates') {
      // [dependencies], [dev-dependencies], [build-dependencies] and the
      // target- and workspace-qualified forms all end the same way.
      if (table === null || !/dependencies\]$/.test(table)) continue;
      const match = /^([A-Za-z0-9._-]+)\s*=/.exec(line);
      if (match) found.add(match[1]);
      continue;
    }

    // pyproject.toml puts dependencies in a list, requirements.txt one per
    // line. A bare `key = value` under any other table is not a package.
    if (table !== null && !/dependencies\]$/.test(table)) continue;
    const match = /^["']?([A-Za-z0-9._-]+)["']?\s*(?:\[[^\]]*\])?\s*(?:[=<>!~,"']|$)/.exec(line);
    if (match) found.add(match[1].toLowerCase());
  }

  return [...found];
}

/**
 * Fold a name to the spelling the published index is keyed under.
 *
 * PyPI treats `PyYAML` and `pyyaml` as one package and normalises any run of
 * dot, dash or underscore to a single dash. npm has been lowercase-only for
 * new names since 2017. crates.io folds case but keeps the separator.
 */
export function foldName(registry, name) {
  const trimmed = name.trim();
  if (registry === 'pypi') return trimmed.toLowerCase().replace(/[-_.]+/g, '-');
  return trimmed.toLowerCase();
}
