/**
 * Everything the launch says, in one place.
 *
 * It was in `scripts/caption.mjs`, which printed it. A reference sheet was then
 * wanted as a page — something to hold beside the compose box and check a paste
 * against — and a second copy of the same paragraphs would have been the exact
 * failure this file exists to prevent. A reference that can disagree with the
 * thing it references is worse than none.
 *
 * So both the terminal and the sheet import this, and there is one set of
 * words. Figures arrive as arguments rather than being read here: the caller
 * has the bundle open already, and a pure module can be tested without one.
 */

export interface LaunchFigures {
  /** Days the incident archive reaches back. Measured from the oldest row held. */
  observedDays: number;
  incidents: number;
  providers: number;
  /** Release lines already past their end-of-life date. */
  ended: number;
  /** Release lines crossing it inside the current window. */
  approaching: number;
  models: number;
  /** Packages carrying the date their registry actually shipped them. */
  shipDated: number;
  /** Commit histories read for the bus factor. */
  histories: number;
  /** Providers by volume, with the median duration each announced. */
  medians: { name: string; count: number; minutes: number }[];
  freeTools: number;
  totalTools: number;
}

export interface LaunchCopy {
  /** Under 280 characters, for anywhere that counts them. */
  brief: string;
  /** The full caption, for a platform with no limit. */
  long: string;
  /** The line that carries the article above the film. */
  quote: string;
  articleTitle: string;
  article: string;
  /** The launchpad's own form, field by field. */
  virtuals: {
    /** Account bio. Short, about who is building rather than about the token. */
    bio: string;
    /** "What's this token about?" — capped at 500 characters by the form. */
    about: string;
    howItWorks: string;
    roadmap: string;
    tokenUtility: string;
    additionalDetails: string;
  };
}

const n = (value: number): string => value.toLocaleString('en');

export function launchCopy(f: LaunchFigures): LaunchCopy {
  const inline =
    f.medians.length === 0
      ? ''
      : ` — ${f.medians.slice(0, 4).map((m) => `${m.name} ${n(m.minutes)}`).join(', ')}, in minutes`;

  const table = f.medians
    .slice(0, 5)
    .map((m) => `${m.name} — ${n(m.count)} incidents, ${n(m.minutes)} minutes median`)
    .join('\n');

  /**
   * Every one of these leads with the archive and names no repository count.
   *
   * The readings that never touch GitHub are the answer to "a GitHub summariser
   * is worth only what GitHub already shows you". Opening with a watchlist size
   * concedes that in the first line, and a count of what this project watches is
   * a fact about this project rather than about the reader.
   */
  const brief = `Status pages forget. This kept ${n(f.observedDays)} days — ${n(f.incidents)} outages across ${n(f.providers)} providers, with how long each actually took.

Plus ${n(f.ended)} release lines past end-of-life, and ${n(f.models)} model prices, dated.

None of it from GitHub.

npx sighttrue check

$SGHT — Virtuals, Robinhood Chain.`;

  const long = `Every status page forgets. They carry a few months, then the incident is gone and the provider's record goes with it.

This kept ${n(f.observedDays)} days. ${n(f.incidents)} outages across ${n(f.providers)} providers, each with how long they said it took${inline}.

Also ${n(f.ended)} release lines already past the date they stop getting security fixes, and ${n(f.models)} models with every price change dated.

None of that comes from GitHub. Your agent can buy any of it one call at a time — no signup, no key, no human.

npx sighttrue check

$SGHT — launching on Virtuals, Robinhood Chain.

sighttrue.com`;

  const quote = `Status pages keep a few months. We kept ${n(f.observedDays)} days.

${n(f.incidents)} outages across ${n(f.providers)} providers, with how long each one said it actually took. Plus what stops getting security fixes, and what quietly changed price.

Your agent can buy any of it, one call at a time.`;

  const articleTitle = `Every status page forgets. We kept ${n(f.observedDays)} days.`;

  /**
   * The first three lines are written to stand alone, because that is all a
   * reader sees before deciding whether to open it. An article whose opening
   * needs its own headline to make sense has spent its only chance.
   */
  const article = `Every status page forgets.

They carry a few months, then the incident is gone — and with it the record of how a provider actually behaves, which is the only thing anybody wanted from a status page in the first place.

This one has been keeping them for ${n(f.observedDays)} days. ${n(f.incidents)} outages across ${n(f.providers)} providers, each with the duration the provider itself announced.

## How long they actually take

${table}

Median across incidents that published both a start and an end. A median is not a promise about the next one, and an incident that was never given an end time is not counted here at all. Those two sentences are why this is worth reading: the number is bounded, and the bound is stated.

Nobody else has this, because it cannot be reconstructed. A status page that deleted an incident in ${n(f.observedDays)} days of history did not keep a copy for you. Either something was reading it at the time or the record is gone.

## What else is measured

${n(f.ended)} release lines are already past the date they stop receiving security fixes. ${n(f.approaching)} more cross it in the current window. ${n(f.models)} models are tracked with every price change dated. ${n(f.shipDated)} packages carry the date their registry actually shipped them, which is not the date of their last commit. ${n(f.histories)} commit histories are read for the bus factor.

None of that comes from a repository host. All of it is committed to a public repository every four hours, timestamped and append-only, so any figure on any page can be checked against the file it came from.

## Why a token

An AI agent cannot use a credit card.

It has no billing address. It cannot answer a 3-D Secure prompt. It cannot open an account or agree to terms on anyone's behalf. Every one of those is load-bearing in card payments and none of them has a machine-shaped answer.

The workaround the industry settled on is to make the machine borrow a human's credentials — an API key, issued to a person, billed to a person's card, pasted into a program. It works, and it means every purchase a machine makes has to be arranged in advance by somebody who signed up first.

A wallet is the one payment instrument a machine can hold on its own terms. $SGHT is what this service charges in, so an agent that has never met its operator can still buy one answer.

## Four messages, no account

The protocol is x402 — HTTP's own answer to being asked for money.

1. The agent asks for a reading.
2. The server replies 402 with the price, the asset, the chain and where to send it.
3. The agent pays and asks again, carrying the receipt.
4. The server verifies it on chain — twelve confirmations — and answers.

There is no signup step because there is nowhere to sign up to.

## What a call costs

Priced by how hard the reading is to get, not by how valuable it might be to you. That second one is a guess about your business.

1 credit restates a public source. 2 joins sources nobody joins. 5 rests on the archive — answerable only because the reading was taken and kept every four hours for as long as this has been running.

${n(f.freeTools)} of the ${n(f.totalTools)} tools stay free, and a test enforces that rather than a sentence on a page.

## What the token is not

It is not access to the site. Every page, bundle and archive is free to read and free to download, holder or not.

It is not a governance token. Holding it votes on nothing. The watchlist changes by reviewed commit, in public.

It is not a claim on revenue. It is payment for a service, in the ordinary sense that a token is what the meter reads.

There is nothing to connect a wallet to, and there will not be.

It does not make the readings better. Paid tools are not more accurate than free ones — they are harder to produce, and a paid answer carries the same stated limits as a free one.

## Check it before you believe it

    npx sighttrue check

One command. It reads the manifest in the current directory and reports what is on record. No account, nothing uploaded.

The readings are at sighttrue.com. The agent that takes them is at github.com/sighttrue/sighttrue, and its commit log is the argument.

$SGHT launches on Virtuals, on Robinhood Chain.`;

  /**
   * The launchpad's own form.
   *
   * Held to the same rules as everything else: no price, no supply, no return,
   * no revenue, and nothing described as safe or recommended. A launchpad form
   * is where those rules are most tempting to relax, because the fields are
   * literally headed "Roadmap" and "What's this token about?" and every other
   * entry on the page answers them with a promise.
   *
   * The roadmap states only what is built and what is next, without dates. A
   * date on a roadmap is a claim about a future nobody has measured.
   */
  const virtuals = {
    bio: `An agent that watches open-source infrastructure and publishes every reading it takes to a public repository. Provider outages, end-of-life dates, model prices, real ship dates, bus factor. Read for free at sighttrue.com; bought by other agents one call at a time.`,

    about: `$SGHT is what an agent pays with. Sighttrue keeps ${n(f.observedDays)} days of provider outages after the status pages that announced them moved on — ${n(f.incidents)} across ${n(f.providers)} providers — plus end-of-life dates, model prices and real ship dates. Agents buy any of it one call at a time over x402: no account, no API key, no human. A card needs a billing address and a 3-D Secure prompt; an agent has neither. It can hold a wallet. ${n(f.freeTools)} of ${n(f.totalTools)} tools stay free, enforced by a test.`,

    howItWorks: `An agent runs every four hours on GitHub Actions, takes eleven readings, and commits each one to a public repository — timestamped, append-only. The site is rebuilt from that ledger, so any figure on any page can be checked against the file it came from.

Six of the eleven readings never touch a repository host: provider incidents kept after their own feeds drop them, end-of-life dates, model prices with every change dated, registry ship dates, base image weight, and question volume.

Selling them works over x402, which is HTTP's own answer to being asked for money. The agent asks; the server replies 402 with the price, the asset, the chain and where to send it; the agent pays and asks again carrying the receipt; the server verifies the transfer on chain — twelve confirmations — and answers. No account is created at any point, because there is nowhere to sign up to.

Payment is verified against the chain directly rather than through a third party, and one transaction can buy credit exactly once: the transaction hash is the primary key, enforced by the database rather than by the code that calls it.`,

    roadmap: `Built and running: the readings, the public ledger, the site, an MCP server with ${n(f.totalTools)} tools, a CLI (npx sighttrue check), a GitHub Action, a GitHub App, and the x402 payment path end to end.

Next, in order: on-demand registry reads in the browser so a pasted manifest gets an answer for most of its dependencies rather than only the tracked ones; more registries behind the same single description; and a longer archive, which is the one thing that cannot be hurried — it is worth more every day only because it was started earlier.

No dates. A date on a roadmap is a claim about a future nobody has measured, and this project does not make claims it cannot show a file for.`,

    tokenUtility: `Payment for a service, in the ordinary sense that a token is what the meter reads.

An agent cannot use a credit card: no billing address, no way through a 3-D Secure prompt, no account it can open, no terms it can agree to. The industry workaround is to make the machine borrow a human's credentials — an API key issued to a person, billed to a person's card. That works, and it means every purchase a machine makes was arranged in advance by somebody who signed up first. A wallet is the one payment instrument a machine can hold on its own terms.

Priced by how hard the reading is to get, never by what it might be worth to the buyer: 1 credit restates a public source, 2 joins sources nobody joins, 5 rests on the archive.

${n(f.freeTools)} of the ${n(f.totalTools)} tools stay free and a test enforces it — everything needed to decide whether to install a dependency costs nothing.`,

    additionalDetails: `What the token is not, stated because a reader should not have to find out:

It is not access to the site. Every page, bundle and archive is free to read and free to download, holder or not.

It is not a governance token. Holding it votes on nothing. The watchlist changes by reviewed commit, in public.

It is not a claim on revenue. No share of anything is attached to holding it.

There is nothing to connect a wallet to, and there will not be. A contract address and a copy button is the whole of the interface, by rule.

It does not make the readings better. Paid tools are not more accurate than free ones — they are harder to produce, and a paid answer carries the same stated limits as a free one.

The watchlist is curated and partial, chosen by hand. Nothing here is called safe, unsafe or recommended, because none of those are things this project measures. Findings that turn out to be wrong are superseded by a correction with the same prominence; nothing is deleted.

Everything above can be checked: github.com/sighttrue/sighttrue`,
  };

  return { brief, long, quote, articleTitle, article, virtuals };
}

/**
 * Reads the figures out of a published bundle.
 *
 * Kept beside the copy so a caller cannot assemble half of them by hand, which
 * is how a caption ends up quoting a number no file holds.
 */
export function figuresFrom(
  bundle: {
    incidents: {
      observedDays: number;
      total: number;
      providers: number;
      byProvider: { name: string; count: number; medianMinutes: number | null }[];
    };
    lifecycle: { ended: number; approaching: number };
    models: { available: number };
    staleness: { measured: number };
    contributors: { measured: number };
  },
  tools: { free: number; total: number },
): LaunchFigures {
  return {
    observedDays: bundle.incidents.observedDays,
    incidents: bundle.incidents.total,
    providers: bundle.incidents.providers,
    ended: bundle.lifecycle.ended,
    approaching: bundle.lifecycle.approaching,
    models: bundle.models.available,
    shipDated: bundle.staleness.measured,
    histories: bundle.contributors.measured,
    medians: bundle.incidents.byProvider
      .filter((row) => row.medianMinutes !== null)
      .slice(0, 5)
      .map((row) => ({ name: row.name, count: row.count, minutes: row.medianMinutes as number })),
    freeTools: tools.free,
    totalTools: tools.total,
  };
}
