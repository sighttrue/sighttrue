# sighttrue

Dated readings on the dependencies you are about to install.

```
npx sighttrue check
```

Reads the `package.json`, `requirements.txt`, `Cargo.toml`, `pyproject.toml`,
`composer.json` or `Gemfile` in the current directory and reports what is on
record for each dependency:

- the publisher has **withdrawn** it — npm calls this deprecated, PyPI and
  crates.io call it yanked, RubyGems yanked, Packagist abandoned, NuGet
  deprecated
- it **runs a script on the installing machine**
- its repository is **archived**
- **advisories** filed against it
- a **source-available licence**, which is not the same as open source
- it has **not published in two years**

Each line carries the address of the body that published it, so anything you
quote can be checked by whoever reads it.

```
7 dependencies in package.json, 2 tracked by Sighttrue.

esbuild — evanw/esbuild
  • It runs postinstall on the machine that installs it. Most such scripts
    fetch a platform binary; this does not read what they contain.
    https://www.npmjs.com/package/esbuild
```

It also flags a dependency name that is one character from a package on the
watchlist. Both names exist on the registry; which one you meant is your call.

## Base images

```
npx sighttrue docker
```

Reads the `FROM` lines and joins two readings nobody puts together: when the
runtime stops receiving fixes, and when the image you are pinning was last
rebuilt.

```
node:18
  • nodejs 18 stopped receiving fixes on 2025-04-30, according to endoflife.date.
    https://endoflife.date/nodejs

python:3.10-slim
  • python 3.10 stops receiving fixes on 2026-10-31, in 84 days, according to
    endoflife.date.
    https://endoflife.date/python
```

Multi-stage builds are handled: a `FROM builder` referring to an earlier stage
is not an image and is not reported as one. Fifteen official images are tracked;
anything else reports nothing either way rather than guessing.

## One package

```
npx sighttrue npm:axios
npx sighttrue pypi:requests
npx sighttrue crates:tokio
```

## In CI

Exits 0 by default, because everything above is a reading rather than a rule.
Choose which ones are rules for you:

```
npx sighttrue check --fail-on=withdrawn,archived
```

`--json` prints the same result machine-readably.

## What it does not do

It does not upload your manifest. Names are matched locally against one static
file fetched from sighttrue.com; nothing about your project is sent anywhere,
which is also why it needs no account and no key.

It does not say whether a package is safe to install. Nothing here is scored,
ranked or recommended — those are conclusions, and the readings exist so the
person making the decision makes it knowing what is on record.

An empty result means these particular facts are absent, from a curated
watchlist of around four hundred repositories, in readings taken up to four
hours ago. It does not mean the package is fine.

If the readings cannot be fetched it says so and exits 0. A tool that breaks
your build when somebody else's site is down is a tool you uninstall.

## Where the numbers come from

[sighttrue.com](https://sighttrue.com) — an agent that takes eleven readings
across four hundred hand-picked repositories every four hours and commits every
one of them to a public repository. Advisories are OSV totals, scorecards are
the OpenSSF Scorecard from Google Open Source Insights, publish dates are the
registries' own, and end-of-life dates are published by endoflife.date. None of
it is measured here; all of it is dated and linked.

MIT.
