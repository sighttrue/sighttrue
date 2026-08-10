# Posts

The account is **@Sighttruehq**, display name **Sighttrue**. Every asset here
carries both the handle and the domain, and the site publishes the same pair at
/data/official.json — a cloner can forge one surface, not all of them at once.


Seven posts, one or two a day. The video first; the cards in the order below.

Posts 1 to 4 are sent. From 5 the account turns to the reader who is now making
the dependency decisions — a coding agent, and whoever installed it. That is
where the product actually is: an MCP server, a CLI, and a check that runs in
somebody's pipeline without them visiting the site at all.

## The X profile

**Name** Sighttrue &middot; **Handle** @Sighttruehq &middot; **URL** sighttrue.com

**Bio** (153 characters, inside the 160 limit):

> Your dependencies change without telling you. Licences, end-of-life dates,
> outages, releases — measured every four hours and published as files.

No repository count, deliberately. Every earlier draft opened with "an
instrument pointed at 388 open-source repositories", which tells a reader what
our backlog looks like rather than what they get, and reads as a GitHub summary
in the one line where that impression is hardest to undo. The count was in the
banner footer too and is gone from there for the same reason — a reader takes
the whole image at once, so rewriting the headline while leaving the number
underneath it achieved nothing.

## Voice

No adjectives, no emoji, no "excited to announce". The whole argument of this
product is that its figures can be checked, and a post that opens with
"powerful" or "game-changing" contradicts it on the first line — a developer
reading it has already decided what this is before reaching the number.

Every post is the same shape: **name the thing nobody has, then give the figure
that proves this one does.** The complaint comes before the claim, because the
complaint is what makes somebody recognise their own problem.

Figures below match the cards, which are generated from `dist/data/index.json`.
If a post is written more than a few days after the card, regenerate the card
and update the number here — a caption that disagrees with its own image is the
fastest way to lose the only thing this product is selling.

---

## 1 — The film

Longer than the rest on purpose. It is the first post on an account with no
followers, so it has to do three jobs the others can skip: make somebody
recognise the problem, name the thing, and say what it costs to try.

> Every dependency you ship is changing while you are not looking.
>
> A licence quietly becomes source-available, and your legal team finds out
> during due diligence. A runtime drops out of support, and you hear it from an
> auditor. A package with a busy commit graph has not actually published a
> release in fourteen months.
>
> None of that is in your lockfile. Nobody emails you about any of it.
>
> Sighttrue watches all of it and publishes what it finds — licence changes,
> end-of-life dates, provider outages, real publish dates, advisories, and how
> many people a project would survive losing.
>
> Every figure is written to a file and committed, so any of them can be traced
> back to the run that produced it. There is no chart here you have to take on
> faith.
>
> Free, no account, nothing to install. Paste a package.json, requirements.txt
> or Cargo.toml and read your own stack — it never leaves your browser.
>
> sighttrue.com

*Attach `film.mp4`.*

The structure is deliberate. Three losses first, each specific enough that a
reader checks their own project while reading. Then the line that names what is
missing — not in the lockfile, nobody emails you — because that is the gap the
product fills. Only then the product.

The auditability line sits fourth, not first. It is the reason to trust this and
a terrible opening: a post that leads with verifiable figures is answering an
objection the reader has not made yet.

No repository count, and no adjectives. The count describes our backlog rather
than what the reader gets, and a developer who has read a thousand launch posts
has already discounted the one that opens with "powerful".

## 2 — Outages

> Your provider's status page deletes its own history.
>
> Ask how often it actually went down last year and nobody has the record —
> including them.
>
> 441 incidents across 20 providers, kept after the feeds dropped them.
>
> sighttrue.com/incidents

*Attach `post-1-incidents.png`.*

---

## 3 — End of life

Rewritten to lead with a date that has already passed rather than a count. The
earlier draft said "518 release lines on the clock", which is a fact about our
backlog; a reader checks their own stack when given a version number they
recognise. Rails 7.2 is the example because it went unsupported on the day this
was written, and because Rails is not JavaScript — the account had been reading
as a JavaScript product.

> Rails 7.2 went out of support on 9 August. Nothing will tell you.
>
> The date was published years in advance, like every one of them. 463 release
> lines have already ended, and 14 more end within seven months — Python 3.10,
> .NET 8, PHP 8.2, Postgres 14, Java 17.
>
> 519 lines on the clock, read every day.
>
> sighttrue.com/stack

*Attach `post-2-eol.png`.*

The date is written out rather than said as "today", and that is not fussiness.
A post drafted on the 9th and sent on the 10th says something false in its first
line, about the one subject where being wrong costs this account everything.

If somebody replies asking how to keep track: the site publishes a calendar file
you subscribe to once — `sighttrue.com/eol.ics`. Say that rather than posting it
unprompted; a second link in the first post splits the click.

---

## 4 — Bus factor

Now names a package instead of counting histories. `esbuild` is the right
example: it is in the build of an enormous number of projects, so a reader
recognises it instantly, and the figure is startling without being an accusation.

The wording matters more here than anywhere else on the account. A bus factor of
one is not a criticism, and the post has to say so out loud — otherwise this
reads as an attack on a maintainer who has given the ecosystem a great deal, and
deservedly gets answered that way.

> 96% of the commits in esbuild come from one person. It is in your build right
> now.
>
> That is not a criticism — it is how most of the tools you depend on are
> written. It is just that no dashboard anywhere measures it, so nobody knows
> which of their dependencies are one person.
>
> 387 commit histories, read for who actually writes the code.
>
> sighttrue.com/ecosystem

*Attach `post-3-busfactor.png`.*

---

## 5 — What your agent is answering from

Posts 1 to 4 named the problem for a person reading a dependency list. From here
the account addresses the reader who is actually making that decision now — a
coding agent, and whoever installed it.

`xunit` is the example for the same reason it was before: the repository is busy,
the package has not shipped since January 2025, and its publisher has marked it
deprecated and named the successor. An agent answering from training data does
not know any of that, and will say the package is fine.

> Ask a coding agent whether xunit is maintained. It will say yes.
>
> Its repository is busy. The package has not shipped since January 2025, and
> NuGet carries the publisher's own note marking it deprecated and naming v3 as
> the replacement.
>
> The agent is not wrong on purpose. It is answering from training data, and this
> happened after the data was cut.
>
> sighttrue.com/nuget/xunit

*Attach `post-8-agentmemory.png`.*

No blame in it. "The agent is not wrong on purpose" is doing real work: a post
that reads as an attack on somebody's model gets answered by people defending the
model instead of checking the package. The claim is about *when* the data was
taken, which nobody disputes.

## 6 — One line in the pipeline

The CLI and the Action, which are the only distribution here that runs without
anybody visiting the site. A team installs it once and it checks every build for
years.

> Your dependency was deprecated by its publisher three months ago. Nothing in
> your build says so.
>
> `npx sighttrue check` reads your package.json, requirements.txt, pyproject.toml,
> Cargo.toml, composer.json or Gemfile and tells you which of them the publisher
> has withdrawn, which run scripts on the installing machine, and which have not
> shipped in years.
>
> No key, no account, no service to sign up to. As a GitHub Action it fails the
> build instead.
>
> npmjs.com/package/sighttrue

*Attach `post-9-ci.png`.*

The manifest list is spelled out rather than summarised, because a reader scans
it for their own filename and stops reading if it is not there. "Six registries"
is a fact about us; `Gemfile` is a fact about them.

A network problem is never a finding — if the readings cannot be fetched, the
step says so and passes. Worth saying in a reply if anybody asks, because a
build that breaks when a third-party site is down is a build that gets deleted.

## 7 — One command

The last of the sequence and the only one with something to paste. Rewritten
after `sighttrue@1.4.0` shipped, because the skill changes what this post is
asking for: not "read about our MCP server" but one line, once, after which the
agent does the checking without anybody remembering to.

> Your coding agent recommends packages from training data. It has no idea which
> of them were deprecated last year.
>
> ```
> npx sighttrue skill
> ```
>
> One command. From then on it takes a reading before adding a dependency, a
> base image, a runtime version or a model — and quotes the source, so whoever
> reads the pull request can check it.
>
> Nine tools, no key and no account.
>
> npmjs.com/package/sighttrue

*Attach `post-10-mcp.png`.*

The command is the post. Everything else on this account describes a
measurement; this one asks for an action, and the action is short enough to run
before deciding whether to trust it — which is the right order for a tool nobody
has heard of.

"It has no idea" is not an insult and should not be softened into one. The model
is answering from before the notice existed, which is a fact about timing rather
than capability, and post 5 already made that argument at length.

Nine is the free count, read from `mcp-catalogue.ts` at build time. The
twenty-two paid tools are not mentioned: they cannot be paid for yet, and naming
a price nobody can pay is the one claim on this account that could not be
checked.

The npm link rather than the MCP URL, because the command is what the reader
acts on and `npmjs.com` shows them the package is real before they run anything
on their machine.

---

## Already sent

1 the film · 2 outages · 3 end of life · 4 bus factor.

Kept as a record rather than deleted. What went out is the only reliable guide to
what should not be repeated, and the cards for 1 to 3 are still in
`assets/brand/`.

## If somebody asks how it works

> Everything it reads is committed to a public repository, so the history is the
> audit trail — every reading timestamped and checkable against the source
> directly. It also publishes whether its own detectors have ever been reachable,
> because a detector nothing has crossed is a broken one, not a quiet one.
>
> github.com/sighttrue/sighttrue

## If somebody accuses you of being a clone, or you find one

> The only official channels are listed on the site itself, at the bottom of
> every page, and published as a file: sighttrue.com/data/official.json
>
> Site sighttrue.com · X @Sighttruehq · Code github.com/sighttrue/sighttrue
>
> Anything else is not us.

Do not argue past that. The list is served from a domain nobody else can publish
from, which is the whole of the proof; a longer reply just gives an impersonator
a thread to appear in.

## If somebody asks what it costs

Nothing yet, and say so plainly. The paid tier is not live and promising a price
before it exists is the one claim on this account that could not be checked.

---
