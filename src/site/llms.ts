import type { IndexBundle } from '../types/bundles.ts';
import { SITE_ORIGIN } from './render.ts';

/**
 * `/llms.txt` — the file a model reads when it lands here without a browser.
 *
 * The convention is a plain-text index at the root: what this site is, where
 * its data actually lives, and what it does not support. It costs one static
 * file and it is the only page on this site written for a reader that will
 * never see the CSS.
 *
 * Every figure is passed in from the same bundle the pages render from, so
 * this cannot drift into claiming a corpus size the ledger does not hold —
 * which is the ordinary way a file like this starts lying six weeks after
 * somebody wrote it.
 *
 * The limits are not a footer. A model that reads this is going to paste these
 * numbers into somebody's code review, and the sentence that stops a scorecard
 * being quoted as a safety rating has to be in the same file as the scorecard.
 */
export function renderLlms(index: IndexBundle): string {
  const { watchlist, health, incidents, lifecycle, staleness, models, contributors } = index;

  return `# Sighttrue

> Dated, checkable readings on open-source dependencies and the services they run on.
> One agent takes eleven readings across ${watchlist.active} hand-picked repositories every four
> hours, commits every reading to a public repository, and publishes the result as static files.

Nothing here is generated on request. Every page and every bundle below is a file that was
written by a scheduled run and can be diffed against the run before it.

## Read it as JSON

- [${SITE_ORIGIN}/data/stack-index.json](${SITE_ORIGIN}/data/stack-index.json): every tracked package keyed \`registry:name\` — downloads, OpenSSF scorecard, advisory count, licence, last push, last publish, bus factor, publisher withdrawal, install scripts.
- [${SITE_ORIGIN}/data/incidents.json](${SITE_ORIGIN}/data/incidents.json): ${incidents.total} provider incidents in the last ${incidents.windowDays} days, kept after the providers' own status pages dropped them, with start and resolution times.
- [${SITE_ORIGIN}/data/eol.json](${SITE_ORIGIN}/data/eol.json): ${lifecycle.dated} release lines with published end-of-life dates.
- [${SITE_ORIGIN}/data/models.json](${SITE_ORIGIN}/data/models.json): ${models.available} language models with current prices and context windows.
- [${SITE_ORIGIN}/data/ecosystem.json](${SITE_ORIGIN}/data/ecosystem.json): registry publish dates, base image sizes, question volume, near-miss package names.
- [${SITE_ORIGIN}/data/index.json](${SITE_ORIGIN}/data/index.json): every summary the site renders from.

## Ask it a question

- MCP server: \`${SITE_ORIGIN}/api/mcp\` — streamable HTTP, no key, no account. Tools: check_package, check_stack, check_eol, check_provider, compare_repositories, search_repositories, find_model.
- One package, every reading, each with the address of the body that published it: \`${SITE_ORIGIN}/api/verdict?pkg=npm:axios\`. Add \`&version=4.2\` to narrow the end-of-life answer to one release line.
- One page per package: \`${SITE_ORIGIN}/npm/<name>\`, \`${SITE_ORIGIN}/pypi/<name>\`, \`${SITE_ORIGIN}/crates/<name>\`.

## What the readings are

- **Scorecard** is the OpenSSF Scorecard published by Google Open Source Insights, not computed here. It measures declared practices such as code review and workflow permissions. The median across ${health.scored} scored repositories is ${health.median === null ? 'not yet computable' : health.median.toFixed(1)}.
- **Advisories** are OSV totals for all time and all versions. A mature, well-patched project carries more than a young one.
- **Bus factor** is how many contributors account for half of all commits, read from commit history across ${contributors.measured} repositories.
- **Last publish** is the registry's own date for the newest version, across ${staleness.measured} packages. It is a different fact from the repository's last push and the two disagree constantly.
- **Incidents** are the providers' own announcements, republished unchanged.

## What it does not support

- No figure here states whether a package is safe, unsafe, risky or recommended. Those are conclusions; the readings exist so a reader can reach their own.
- A count of announced incidents measures disclosure as much as reliability. A provider that publishes every degradation will out-count one that publishes nothing, so a low count is not a good sign on its own.
- Time with an incident record open is not downtime, and no availability percentage is published: an open record usually covers one component or one region while the rest keeps serving.
- The watchlist is curated and partial — ${watchlist.active} repositories chosen by hand out of everything that exists. A package that is not covered is not being judged; it is not tracked.
- Readings are taken every four hours at best. Nothing here is real-time.
- Dependency readings come from declared manifests, not from lockfiles, so they cover direct dependencies and not the transitive tree.

## Checking it

The agent's own repository is public and every run commits what it read: [https://github.com/kaitzyy-dev/sighttrue](https://github.com/kaitzyy-dev/sighttrue). A figure published on a date cannot be changed afterwards without the change being visible in that history.
`;
}
