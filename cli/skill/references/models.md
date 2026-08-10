# An AI model

## The call

`find_model` over MCP. Filter by `minContext`, `maxPrice` (USD per million
prompt tokens) or `provider`.

Around 400 models across sixty providers, read daily.

## What it means

**Price moves without announcement.** A price quoted from training data is
routinely wrong, and wrong in a direction that costs money at volume. This is
the single most common thing a model is confidently out of date about.

**Context window.** As the provider publishes it.

**Withdrawn.** A model that was in the catalogue and no longer is. Providers
retire models and the catalogue simply stops listing them, which breaks products
with no notice.

## How to report it

Quote the price with its unit — USD per million prompt tokens — and say the
catalogue was read today. A number without its unit invites a comparison against
a differently-priced one.

Free tiers are excluded from both ends of any cheapest or dearest list. Zero is
a different offer, not a lower price, and mixing them produces a ranking that
means nothing.

Never rank models by quality. This measures price, context and availability. It
does not measure whether a model is any good, and saying so would be inventing a
judgement the data cannot support.
