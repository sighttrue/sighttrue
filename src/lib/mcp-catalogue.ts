/**
 * Every MCP tool, and which tier it belongs to, in one list.
 *
 * The three tools that existed were declared inline in the endpoint, and the
 * pricing page said "All seven MCP tools" — a claim nothing checked, about a
 * server that had three. A catalogue with a test against `PLANS` is how that
 * stops being possible.
 *
 * The free tier is defined by what has already been given away rather than by
 * what is cheap to give. Everything published free stays free permanently:
 * a reader who built something on a tool cannot have it taken back, and an
 * instrument that argues for measurement over marketing cannot afford to be
 * caught withdrawing a promise. Every tool added after the paid tier exists is
 * paid, which costs nobody anything they already had.
 *
 * Pure data. The endpoint reads it; the site prices from it; a test holds the
 * two together.
 */

/** What a caller must have to reach a tool. */
export type Tier = 'free' | 'paid';

export interface McpTool {
  name: string;
  tier: Tier;
  /** The band it is listed under, on the pricing page and in `tools/list`. */
  group: string;
  /**
   * What it answers, written for an agent choosing between tools rather than
   * for a person browsing. An agent reads this and nothing else.
   */
  description: string;
  /** Arguments, as JSON Schema property definitions. */
  properties: Record<string, unknown>;
  required: readonly string[];
  /**
   * Why this reading is not available elsewhere.
   *
   * Kept beside the tool because it is the sentence that justifies charging for
   * it, and a tool that cannot fill this in honestly should not be paid.
   */
  because: string;
}

const PACKAGE_ARGS = {
  registry: { type: 'string' },
  name: { type: 'string', description: 'Package name as the registry spells it.' },
} as const;

export const MCP_TOOLS: readonly McpTool[] = [
  // ------------------------------------------------------------------ free
  {
    name: 'check_before_install',
    tier: 'free',
    group: 'Before you install',
    description:
      'Call this before adding a dependency. Returns only the facts a reviewer would be annoyed to discover afterwards: whether the publisher has withdrawn the package, whether it runs scripts on the installing machine, whether its repository is archived, how many advisories are on record, whether the licence is source-available, and how long since it was actually published. Each fact carries the address of the body that published it. It does not say whether to install; it says what is on record.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because: 'The first tool this server had, and free permanently.',
  },
  {
    name: 'check_package',
    tier: 'free',
    group: 'Before you install',
    description:
      'Read the current standing of one open-source package: downloads with the window they cover, OpenSSF scorecard, advisory count, licence, whether the repository is archived, and when it was last pushed to.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because: 'Free permanently.',
  },
  {
    name: 'check_stack',
    tier: 'free',
    group: 'Before you install',
    description:
      'Read a whole dependency list at once and report what is archived, what carries advisories, what has a source-available licence, and what has not been pushed to in a year. Use when reviewing a package.json, requirements.txt, Cargo.toml, composer.json or Gemfile.',
    properties: {
      registry: { type: 'string' },
      names: { type: 'array', items: { type: 'string' } },
    },
    required: ['registry', 'names'],
    because: 'Free permanently.',
  },
  {
    name: 'search_repositories',
    tier: 'free',
    group: 'Before you install',
    description:
      'Find watched repositories whose name contains a string, with their current readings. Use it to discover what is covered before calling the other tools.',
    properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1 } },
    required: ['query'],
    because: 'Free permanently.',
  },
  {
    name: 'compare_repositories',
    tier: 'free',
    group: 'Before you install',
    description:
      'Hold two watched repositories against each other across downloads, OpenSSF scorecard, advisories, forks, stars and findings on record. Compares only; it does not pick a winner.',
    properties: {
      a: { type: 'string', description: 'Repository as owner/name.' },
      b: { type: 'string', description: 'Repository as owner/name.' },
    },
    required: ['a', 'b'],
    because: 'Free permanently.',
  },
  {
    name: 'find_model',
    tier: 'free',
    group: 'AI models',
    description:
      'Find language models by price and context window, from a catalogue read daily across sixty providers. Use this before choosing a model: prices move without announcement and training data is out of date on the day it ships.',
    properties: {
      minContext: { type: 'integer', description: 'Minimum context window in tokens.' },
      maxPrice: { type: 'number', description: 'Maximum USD per million prompt tokens.' },
      provider: { type: 'string' },
    },
    required: [],
    because: 'Free permanently.',
  },
  {
    name: 'check_eol',
    tier: 'free',
    group: 'Runtime and infrastructure',
    description:
      'Check whether a runtime, database or framework release is still receiving security fixes, and what to move to. Covers about two dozen products read daily from endoflife.date.',
    properties: {
      product: { type: 'string', description: 'Product as endoflife.date spells it, e.g. python, nodejs, postgresql.' },
      cycle: { type: 'string', description: 'Release line, e.g. 3.9 or 20. Omit for every cycle.' },
    },
    required: ['product'],
    because: 'Free permanently.',
  },
  {
    name: 'check_provider',
    tier: 'free',
    group: 'Providers',
    description:
      'Recorded incidents for a hosting or API provider over a window, kept after the provider’s own status page dropped them.',
    properties: {
      provider: { type: 'string', description: 'Provider slug, e.g. cloudflare, openai, github. Omit for every provider.' },
      days: { type: 'integer', minimum: 1, maximum: 730 },
    },
    required: [],
    because: 'Free permanently.',
  },
  {
    name: 'list_readings',
    tier: 'free',
    group: 'Before you install',
    description:
      'List every reading this server can return, what each one measures, and which require a key. Call this first if unsure which tool answers a question.',
    properties: {},
    required: [],
    because: 'A catalogue nobody can read is a catalogue nobody uses.',
  },

  // ---------------------------------------------------------- supply chain
  {
    name: 'who_can_publish',
    tier: 'paid',
    group: 'Supply chain',
    description:
      'How many accounts hold publish rights on a package, as the registry lists them. Answers who can put code on your machine, which is a different question from who writes it.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'Bus factor counts who writes a project. Nothing counts who can ship it, and a package with one publisher is a supply-chain risk whatever its contributor count.',
  },
  {
    name: 'package_weight_history',
    tier: 'paid',
    group: 'Supply chain',
    description:
      'How the published artefact size has moved over time. Returns the readings taken, not a verdict.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'A package that tripled in size is dragging something new into your bundle, and a sudden jump is a classic compromise signature. Registries publish today’s size and no history.',
  },
  {
    name: 'withdrawn_but_installed',
    tier: 'paid',
    group: 'Supply chain',
    description:
      'Packages whose own publisher has withdrawn them and which are still being installed heavily, with the download figure and the publisher’s notice.',
    properties: { limit: { type: 'integer' } },
    required: [],
    because:
      'The gap between a publisher saying stop and the world stopping is a number nobody publishes, and it is a direct measure of how many projects have not noticed.',
  },
  {
    name: 'typosquat_check',
    tier: 'paid',
    group: 'Supply chain',
    description:
      'Whether a name is one edit away from a more widely installed package. States that both names exist; which one was meant is the caller’s call.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because: 'Checked across every registry read here, not npm alone.',
  },
  {
    name: 'funding_gap',
    tier: 'paid',
    group: 'Supply chain',
    description:
      'Packages that ask for funding, beside how heavily they are installed and how many people write them.',
    properties: { limit: { type: 'integer' } },
    required: [],
    because:
      'Install counts and funding links are both public and never joined. The join is the sentence: installed forty million times a month, written by one person, asking for money.',
  },

  // ---------------------------------------------------------- vulnerability
  {
    name: 'time_to_fix',
    tier: 'paid',
    group: 'Vulnerability timing',
    description:
      'Days between an advisory being published and a release appearing that postdates it, per package and as a distribution.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'OSV publishes advisory dates and registries publish release dates. The interval between them is how long users were exposed, and nobody joins the two.',
  },
  {
    name: 'advisory_severity',
    tier: 'paid',
    group: 'Vulnerability timing',
    description:
      'Advisories broken down by severity rather than counted, with identifiers and dates.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'Twelve low advisories and one critical are not the same reading, and a single count renders them identically.',
  },

  // -------------------------------------------------------- runtime and infra
  {
    name: 'runtime_deadlines',
    tier: 'paid',
    group: 'Runtime and infrastructure',
    description:
      'Support end dates for the runtimes a dependency set requires, including any already past.',
    properties: { names: { type: 'array', items: { type: 'string' } } },
    required: ['names'],
    because:
      'Packages declare the runtime they need and endoflife.date knows when that runtime stopped getting fixes. The pair finds dependencies pinning you to an unsupported runtime.',
  },
  {
    name: 'base_image_check',
    tier: 'paid',
    group: 'Runtime and infrastructure',
    description:
      'For a container base image: its size, when it was last rebuilt, and whether the OS underneath it is still supported.',
    properties: { image: { type: 'string' } },
    required: ['image'],
    because:
      'An image whose Alpine went end-of-life stopped receiving OS patches, and that shows up in no vulnerability scanner because there is no advisory to match.',
  },
  {
    name: 'registry_health',
    tier: 'paid',
    group: 'Runtime and infrastructure',
    description: 'Recorded outages of the package registries themselves, kept after their status pages drop them.',
    properties: { registry: { type: 'string' } },
    required: [],
    because: 'A registry outage stops every deploy that depends on it, and no one keeps the record.',
  },

  // ------------------------------------------------------------- providers
  {
    name: 'provider_incidents',
    tier: 'paid',
    group: 'Providers',
    description:
      'A provider’s recorded incidents, grouped by the component that failed, over the whole archive rather than the window its status page shows.',
    properties: { provider: { type: 'string' } },
    required: ['provider'],
    because:
      'Status pages delete their own history. The same component failing seven times in a year is a fact only an archive can state.',
  },
  {
    name: 'provider_transparency',
    tier: 'paid',
    group: 'Providers',
    description:
      'How long a provider takes to acknowledge an incident: the interval between an incident starting and its first public update.',
    properties: { provider: { type: 'string' } },
    required: [],
    because:
      'This measures disclosure rather than reliability, and it is not published anywhere. Forty minutes to admit something is a different vendor from three.',
  },
  {
    name: 'provider_terms_changed',
    tier: 'paid',
    group: 'Providers',
    description: 'When a provider last changed its terms or pricing page, from a stored fingerprint of the page.',
    properties: { provider: { type: 'string' } },
    required: [],
    because: 'Terms changes carry commercial consequences and are archived by nobody.',
  },

  // ---------------------------------------------------------------- models
  {
    name: 'model_price_history',
    tier: 'paid',
    group: 'AI models',
    description: 'Every recorded price for a model, with the date each was read.',
    properties: { model: { type: 'string' } },
    required: ['model'],
    because: 'Price tables carry no history. A rise is announced in a blog post and then invisible.',
  },
  {
    name: 'model_withdrawn',
    tier: 'paid',
    group: 'AI models',
    description: 'Models that were in the catalogue and no longer are, with the date last seen.',
    properties: {},
    required: [],
    because: 'A retired model breaks somebody’s product with no notice, and the catalogue simply stops listing it.',
  },

  // ------------------------------------------------------------- community
  {
    name: 'help_availability',
    tier: 'paid',
    group: 'Community',
    description:
      'For a technology tag: questions asked against questions answered, over time.',
    properties: { tag: { type: 'string' } },
    required: ['tag'],
    because:
      'Question volume measures attention. The answered share measures whether help still exists, which is the earlier signal that a community is dispersing.',
  },

  // ------------------------------------------------------------ for agents
  {
    name: 'audit_manifest',
    tier: 'paid',
    group: 'For agents',
    description:
      'Read a whole manifest and return every reading on record for it, ordered by how much a reviewer would want to know. One call instead of one per dependency.',
    properties: { manifest: { type: 'string' }, filename: { type: 'string' } },
    required: ['manifest'],
    because: 'An agent auditing forty dependencies should not make forty calls.',
  },
  {
    name: 'diff_since',
    tier: 'paid',
    group: 'For agents',
    description:
      'What changed for a set of packages since a given date, read from the daily archive.',
    properties: {
      names: { type: 'array', items: { type: 'string' } },
      since: { type: 'string', description: 'YYYY-MM-DD.' },
    },
    required: ['names', 'since'],
    because:
      'The archive is the one dataset here that cannot be rebuilt, and this is the question it exists to answer.',
  },
  {
    name: 'watch_add',
    tier: 'paid',
    group: 'For agents',
    description:
      'Add a package to the caller’s own private watchlist, so later readings are about their stack rather than the public one. The list is private to the key that created it.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'The public watchlist is curated and partial. A caller’s dependencies are neither, and an agent auditing them should be reading the right list.',
  },
  {
    name: 'watch_changes',
    tier: 'paid',
    group: 'For agents',
    description:
      'Everything that has changed across the caller’s private watchlist since a given date: withdrawals, licence changes, advisories, archived repositories and runtimes going out of support.',
    properties: { since: { type: 'string' } },
    required: [],
    because:
      'Every other tool here answers a question at the moment it is asked. This is the only one that answers what happened while nobody was looking, which is the reason to keep a list at all.',
  },
  {
    name: 'explain_finding',
    tier: 'paid',
    group: 'For agents',
    description:
      'Given a finding id, return what was measured, when, by whom, and the address it can be checked at. For an agent quoting a figure into a review.',
    properties: { id: { type: 'string' } },
    required: ['id'],
    because: 'A figure an agent pastes into a code review has to be checkable by whoever reads it.',
  },
  {
    name: 'domain_risk',
    tier: 'paid',
    group: 'For agents',
    description:
      'Whether the domains a package points at — homepage, funding, documentation — still resolve to a registered owner.',
    properties: PACKAGE_ARGS,
    required: ['registry', 'name'],
    because:
      'A lapsed domain picked up by somebody else turns an old README link into a live hijack route.',
  },
];

export const FREE_TOOLS: readonly McpTool[] = MCP_TOOLS.filter((tool) => tool.tier === 'free');
export const PAID_TOOLS: readonly McpTool[] = MCP_TOOLS.filter((tool) => tool.tier === 'paid');

export function toolByName(name: string): McpTool | undefined {
  return MCP_TOOLS.find((tool) => tool.name === name);
}

/** The groups in catalogue order, for a page that lists them. */
export function groups(): { group: string; tools: McpTool[] }[] {
  const out: { group: string; tools: McpTool[] }[] = [];
  for (const tool of MCP_TOOLS) {
    const held = out.find((entry) => entry.group === tool.group);
    if (held) held.tools.push(tool);
    else out.push({ group: tool.group, tools: [tool] });
  }
  return out;
}
