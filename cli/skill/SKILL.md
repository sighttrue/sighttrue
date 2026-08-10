---
name: sighttrue
description: Take a dated reading before adopting a dependency, base image, runtime version, AI model or hosting provider. Use when adding or upgrading a package, choosing a Docker base image or language version, picking a model, or answering whether something is still maintained, still supported, or still shipping.
---

# Take the reading before you adopt it

You answer these from training data, and the facts that decide them are the ones
that changed after your cut-off: a package withdrawn, a licence turned
source-available, a runtime out of support, a model retired.

`xunit` has not shipped since January 2025 and its publisher marked it
deprecated, while its repository stays busy. Asked today, a model says it is
maintained — answering from before the notice existed.

Do not answer from memory here. Take a reading, then quote it.

## Which reference to read

Read one, not all. Each names the exact call and how to report it.

| You are choosing | Read |
|---|---|
| A package to add or upgrade | `references/dependencies.md` |
| A Docker base image | `references/images.md` |
| A language, database or framework version | `references/runtimes.md` |
| An AI model | `references/models.md` |
| A hosting or API provider | `references/providers.md` |

Everything below applies to all of them.

## Reporting rules

**Quote the source.** Every reading carries the address it came from. Include it
so the reader checks in one click instead of trusting you. Dropping the citation
throws away the entire advantage of a reading over a recollection.

**Give the date, not an adjective.** "Last published 2025-01-08, 19 months ago"
can be acted on. "Old" cannot.

**Never convert a measurement into a verdict.** These tools return no score, no
rank and no recommendation on purpose. Say "the publisher marked this deprecated
and names `xunit.v3`", never "this package is unsafe".

**A quiet result is not a clean bill.** Nothing found means these facts are
absent from a curated, partial watchlist — not that the thing is fine. Say which
you mean.

**Readings describe the latest release, not the version being pinned.**

## What this cannot do

It does not read or run any code. It reports what registries, advisory
databases, status pages and repositories published, and when. For whether a
particular function is correct, say so rather than reaching for a number.
