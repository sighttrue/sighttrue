# A package you are about to add or upgrade

## The call

MCP, no key and no account:

```json
{ "mcpServers": { "sighttrue": { "url": "https://sighttrue.com/api/mcp" } } }
```

- `check_before_install` — one package. Registry and name.
- `check_stack` — a list of names at once, when reviewing a manifest or a diff.
- `search_repositories` — when unsure whether something is covered at all.

Registries: `npm`, `pypi`, `crates`, `gem`, `packagist`, `nuget`, `maven`.

Without MCP, for a whole manifest in the working directory:

```
npx sighttrue check
```

It finds `package.json`, `requirements.txt`, `pyproject.toml`, `Cargo.toml`,
`composer.json` or `Gemfile` and reports every dependency in it.

## What comes back, and what each one means

**Withdrawn.** The publisher's own instruction not to install it — npm calls it
deprecated, PyPI and crates.io yanked, RubyGems yanked, Packagist abandoned,
NuGet deprecated. This is the most important field and it is theirs, not ours.
Quote their words.

**Install scripts.** What runs on the machine during install. Naming them is a
fact about the package, not an accusation — most fetch a platform binary.

**Last publish.** The registry's date for the newest release. A long gap is not
abandonment: a finished library is finished. Give the date and the elapsed time
and stop there.

**Advisories.** OSV totals for all time and all versions, not for the version
being installed. A mature, well-patched package carries more than a young one,
so a high count on its own is not a warning.

**Licence.** Flagged when source-available — BUSL, SSPL, Elastic and similar.
That is a licensing fact with commercial consequences, not a security one.

**Archived.** The repository is read-only. Published versions keep working.

## Reviewing a pull request

Read the manifest on both sides rather than the diff. A patch hunk arrives
without the context that says whether a line is a dependency or a script, and
that class of mistake produces comments about packages nobody added.

Report only what changed. A reviewer scrolling past twelve unchanged
dependencies stops reading before reaching the one that matters.
