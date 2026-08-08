# Sighttrue for VS Code

Dated readings on a dependency, while you are typing it.

Underlines a dependency in `package.json`, `requirements.txt`, `Cargo.toml` or
`pyproject.toml` when something is on record for it:

- the publisher has **withdrawn** it — npm calls this deprecated, PyPI and
  crates.io call it yanked
- it **runs a script on the installing machine**
- its repository is **archived**
- **advisories** filed against it
- a **source-available licence**, which is not the same as open source
- it has **not published in two years**

The code on each diagnostic links to that package's page, where every figure
carries the address of the body that published it.

## What it does not do

**It does not judge.** Every diagnostic is Information severity, never a
warning. A warning colour says "you have made a mistake" and none of these do —
they are things on record about a package, and whether any of them should stop
you is your call.

**It does not send your code anywhere.** One static file is fetched from
sighttrue.com once per session and every name is matched against it locally.
Nothing about your project leaves the machine, which is also why there is no
account and no key.

**It says nothing about a package it does not track.** The watchlist is curated
and partial. Silence means the package is not on it, not that it is fine.

**It stays quiet when it cannot read.** If the readings cannot be fetched there
is no error box and no squiggle. An extension that interrupts your editing
because somebody else's site is down is an extension you disable that
afternoon.

## Where the numbers come from

[sighttrue.com](https://sighttrue.com) — an agent that takes eleven readings
across four hundred hand-picked repositories every four hours and commits every
one of them to a public repository. Advisories are OSV totals, scorecards are
the OpenSSF Scorecard from Google Open Source Insights, publish dates are the
registries' own. None of it is measured here; all of it is dated and linked.

The same readings are available as a command — `npx sighttrue check` — and as a
GitHub Action, a GitHub App that comments on pull requests, and an MCP server
for coding agents. All four read the same published file, so they cannot
disagree.

MIT.
