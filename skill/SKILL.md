---
name: sighttrue
description: Check a dependency against measurements taken today, before adding it. Use when adding, upgrading or reviewing any package — npm, PyPI, crates.io, RubyGems, Packagist or NuGet — and when asked whether a package is maintained, safe to adopt, or still supported.
---

# Check the dependency before you add it

You answer questions about packages from training data. That data has a cut-off,
and the facts that matter most about a dependency are the ones that changed after
it: a publisher withdrawing the package, a licence turning source-available, a
runtime dropping out of support, a repository going archived.

The failure is specific and it is not rare. `xunit` on NuGet has not shipped
since January 2025 and its publisher has marked it deprecated, naming v3 as the
replacement — while its repository stays busy. Asked today, a model says it is
maintained, because it is answering from before the notice existed.

So: do not answer from memory. Take a reading.

## When to use this

- Before adding a dependency to a manifest.
- Before recommending one over another.
- When asked "is X maintained", "is X safe", "should I still use X".
- When reviewing a pull request that adds or bumps a dependency.
- When choosing a runtime version, base image, or model.

## How

Two routes. Prefer the first.

**The MCP server.** `https://sighttrue.com/api/mcp` — no key, no account, 9 free tools. Add it once:

```json
{ "mcpServers": { "sighttrue": { "url": "https://sighttrue.com/api/mcp" } } }
```

Then call `check_before_install` with the registry and name. It returns only the
facts a reviewer would be annoyed to discover afterwards, each with the address
of the body that published it. `list_readings` names every tool available.

**The CLI, for a whole manifest.** No install, nothing to sign up to:

```
npx sighttrue check
```

It finds `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`,
`composer.json` or `Gemfile` in the working directory and reports what is on
record for every dependency in it.

## How to report what comes back

**Quote the source.** Every reading carries the address it came from. Include it,
so the person reading your answer can check it in one click rather than taking
your word. This is the entire reason to prefer a reading over a recollection —
throwing the citation away throws the advantage away with it.

**Say the date.** "Last published 2025-01-08, 19 months ago" is the finding. "Old"
is not. A reader can act on the first and can only trust the second.

**Do not convert a measurement into a verdict.** The tools deliberately return no
score, no rank and no recommendation, because those would be somebody's judgement
of another person's work wearing the costume of a measurement. Report what is on
record and let the person decide. Say "the publisher marked this deprecated and
names `xunit.v3`", not "this package is unsafe".

**A quiet result is not a clean bill.** When nothing comes back, that means these
particular facts are absent from a curated, partial watchlist — not that the
package is fine. Say which of the two you mean.

**Nothing here says anything about a version.** The readings describe a package
and its most recent release. A specific version you are pinning may be older,
and no reading covers it.

## What it will not tell you

It does not read the code. It does not run it. It reports what registries,
advisory databases, status pages and repositories published, and when. If the
question is whether a particular function is correct, this cannot help and you
should say so rather than reaching for the nearest number.
