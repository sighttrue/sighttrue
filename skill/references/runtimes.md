# A language, database or framework version

## The call

`check_eol` over MCP, with the product as endoflife.date spells it — `python`,
`nodejs`, `postgresql`, `php`, `dotnet`, `rails`, `laravel`, `kubernetes`,
`alpine`, `docker-engine`, `redis`. Omit the cycle for every release line.

About two dozen products, read daily.

## What it means

**Ended.** That release line stopped receiving security fixes on the date given.
Anything still on it accumulates every vulnerability published since, with no
patch coming. This is the finding that matters and it is a date, not a judgement.

**Ending.** Published years ahead and watched by almost nobody. Teams normally
learn from an auditor. Give the date and the days remaining.

**LTS.** Long-term support, which usually means a longer window rather than a
different kind of support.

## How to report it

Name the version and the date. "Python 3.10 stops getting security fixes on
2026-10-31, in 83 days" is actionable. "Consider upgrading" is not, and is a
recommendation the tools deliberately do not make.

If a runtime has already ended, say so plainly and give the date it happened.
Do not soften it and do not escalate it — the date carries its own weight.

Somebody wanting to track these rather than ask each time can subscribe once to
`https://sighttrue.com/eol.ics`, which lands the deadlines in a calendar months
ahead. Mention it only if asked how to keep track.
