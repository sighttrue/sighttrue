/**
 * Where each dependency sits in the file it was declared in.
 *
 * The readings have always been about a package. An editor underlines a
 * *range*, and a terminal that can say `package.json:14` saves somebody the
 * search — so this is the one thing the rest of the reader never needed and
 * both of those do.
 *
 * Deliberately a scan rather than a parser. A real manifest is often mid-edit
 * and syntactically broken when an editor asks — that is precisely when
 * somebody is adding the dependency — so anything that requires the file to
 * parse would go silent at the only moment it matters. A scan degrades to
 * finding fewer lines instead of finding none.
 *
 * Returns zero-based line and column, which is what editors take, with the
 * length of the name so a caller can underline exactly it and nothing else.
 */

/** Escape a package name so it can sit inside a regular expression. */
function literal(name) {
  return String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The line a dependency is declared on, or null.
 *
 * Only inside a block that declares dependencies. `"name": "my-app"` at the top
 * of a package.json is the project's own name, and underlining it as though it
 * were a dependency is the same mistake a Cargo reader made here before: every
 * line in these files looks alike, and the block is what tells them apart.
 */
export function positionOf(text, registry, name) {
  const lines = String(text).split(/\r?\n/);

  if (registry === 'npm') {
    // Track which JSON key we are inside. Only the dependency maps count.
    let inDeps = false;
    const opener = /"(dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:\s*\{/;
    const pattern = new RegExp(`"(${literal(name)})"\\s*:`);

    for (const [index, line] of lines.entries()) {
      const open = opener.exec(line);
      if (open !== null) inDeps = true;
      // A closing brace at the start of the line ends the block. Good enough
      // for a formatted manifest and harmless on one that is not: the worst
      // case is a name not found, never a wrong line.
      else if (inDeps && /^\s*\}/.test(line)) {
        inDeps = false;
        continue;
      }
      if (!inDeps) continue;

      // Searched from after the opener, so a manifest written on one line —
      // which is what a generator emits and what a paste often is — is read
      // rather than skipped along with the block it opens.
      const from = open === null ? 0 : open.index + open[0].length;
      const match = pattern.exec(line.slice(from));
      if (match !== null) {
        return {
          line: index,
          character: from + match.index + 1,
          length: String(name).length,
        };
      }
    }
    return null;
  }

  if (registry === 'crates') {
    let table = null;
    for (const [index, raw] of lines.entries()) {
      const line = (raw.split('#')[0] ?? '').trim();
      if (line.startsWith('[')) {
        table = line.toLowerCase();
        continue;
      }
      if (table === null || !/dependencies\]$/.test(table)) continue;

      const match = new RegExp(`^(\\s*)(${literal(name)})\\s*=`).exec(raw);
      if (match !== null) {
        return {
          line: index,
          character: (match[1] ?? '').length,
          length: String(name).length,
        };
      }
    }
    return null;
  }

  // requirements.txt and pyproject: the name opens the line, optionally quoted.
  for (const [index, raw] of lines.entries()) {
    const line = raw.split('#')[0] ?? '';
    const match = new RegExp(`^(\\s*["']?)(${literal(name)})(?=["']?\\s*(?:\\[|[=<>!~,]|$))`, 'i').exec(
      line,
    );
    if (match !== null) {
      return {
        line: index,
        character: (match[1] ?? '').length,
        length: String(match[2]).length,
      };
    }
  }

  return null;
}
