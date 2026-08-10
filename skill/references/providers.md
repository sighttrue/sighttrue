# A hosting or API provider

## The call

`check_provider` over MCP, with a slug — `cloudflare`, `openai`, `github`,
`stripe`, `supabase`, `vercel`, `netlify` and others. Omit it for every provider.
`days` sets the window, up to 730.

Twenty-two providers, kept after their own status pages dropped the record.

## What it means

**Incidents on record.** Announced by the provider itself. Status pages delete
their history, so asking how often something failed last year is a question
nobody can answer — including them.

**Time with a record open.** Overlapping incidents are merged rather than summed.
Adding them overstated one provider by two days, out of records that ran in
parallel.

**Impact.** The provider's own grading — none, minor, major, critical. Theirs,
not ours. Scheduled maintenance is excluded.

## How to report it

Give the count, the window it covers, and the provider's own grading. Say the
window explicitly: "eleven incidents in the last 90 days" is a reading, "often
goes down" is a characterisation.

**Never state an availability percentage.** The arithmetic is trivial and the
answer would be wrong in the most damaging direction, because only announced
incidents are on record and a provider that announces more looks worse than one
that announces less. The site refuses to publish this figure and so should you.

A provider absent from the list has no record here. That is not a good record.
