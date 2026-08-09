# Posts

The account is **@Sighttruehq**, display name **Sighttrue**. Every asset here
carries both the handle and the domain, and the site publishes the same pair at
/data/official.json — a cloner can forge one surface, not all of them at once.


Six posts, one or two a day. The video first; the cards in the order below.

A seventh is drafted and held. It does not go out until the thing it describes
is real — see the note on it at the bottom.

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

## 5 — Shipped

The sharpest thing this project has found, and it needs no adjectives at all.
xunit's repository was pushed to two days before this was written; the package
it publishes has not shipped in nineteen months and carries the maintainers' own
notice pointing at a successor. Every "is it maintained" badge in existence
reads the first date.

Also the post that retires the GitHub framing for good, because the finding is
not visible on GitHub at all.

> The xunit repository was pushed to two days ago.
>
> The package has not shipped since January 2025, and its own publisher has
> marked it deprecated with a note telling you to move to v3.
>
> Every "is it maintained" badge reads the first date. This reads the second —
> npm, PyPI, crates.io, RubyGems, Packagist and NuGet.
>
> 182 packages, by the date the registry actually released them.
>
> sighttrue.com/nuget/xunit

*Attach `post-4-staleness.png`.*

The publish date is absolute for the same reason as post 3. The push is not,
because the recency is the whole point — a repository pushed to this week beside
a package silent for nineteen months is the entire argument in one line, and
"recently" throws it away.

So this one has a shelf life of a day or two. Open sighttrue.com/nuget/xunit
immediately before sending and copy the words in its first paragraph. If they no
longer match the draft, change the draft; if the repository has gone quiet
altogether the post has nothing left to say, and there are fourteen other
packages on `/ecosystem` in the same shape.

This draft said "yesterday" for a day, on the strength of the page saying it,
and the page was wrong: the count ran from midnight today back to the exact
minute of the push, so 20:03 on the 7th came out as 1.16 days on the 9th and
rounded down to one. GitHub, one click away, said 7 August. Fixed in
`daysBetween`, which now counts calendar days like the person checking it does.

The link goes to the package page rather than to `/ecosystem`, because the post
makes a claim about one package and the page that proves it is that package's.
Every figure in the post is on it, each with the address of whoever published
it.

---

## 6 — Your stack

> Paste your package.json.
>
> Every dependency checked for advisories, licence changes, archived
> repositories and how long since anything actually shipped.
>
> No account, nothing installed, and the manifest never leaves your browser.
>
> sighttrue.com/stack

*Attach `post-5-yourstack.png`.*

---

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

## 7 — Held back until the token exists

**Do not post this yet.** It goes out on the day the paid tier is real, and not
before. Two things have to be true first, and neither is today:

1. The paid tools return data. Twenty-two are declared, listed and correctly
   refused without a key; none is implemented.
2. The token exists, with a contract address and a rate. `TOKENS_PER_CENT` is 0.

*Attach `post-7-freestaysfree.png`.*

> Everything published free stays free. Taking one back would lose the argument
> this instrument exists to make.
>
> 9 tools an agent can call with no key and no account. That number goes up, not
> down.
>
> The paid tools are the ones that did not exist before today.
>
> sighttrue.com/pricing

The card carries no price, no contract address and no claim about a token,
because none of those can be checked on the day it is drafted, and this account
has nothing to sell except being checkable. The figure comes from
`mcp-catalogue.ts` at build time, so it cannot drift from the server the way
"seven MCP tools" did for weeks against a server that answered eight.

The angle is the promise rather than the product, and that is the whole reason
it is worth posting. Anybody can announce a paid tier. Almost nobody writes down
what stays free, publishes the count, and lets themselves be held to it — and
that sentence is the only reason to believe anything else on the page.

Say nothing about price in the replies until there is one. "Not live yet" is a
complete answer and the only one that stays true.
