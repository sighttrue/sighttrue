/**
 * A Model Context Protocol server over the published bundles.
 *
 * Coding agents now sit between a developer and most dependency decisions, and
 * they answer "is this package healthy" from training data that is a year old.
 * This lets them answer it from a reading taken today.
 *
 * It is the second public surface on this project and by far the safer of the
 * two. `/api/ask` holds an API key, calls a third party, and spends a quota
 * somebody could drain. This holds nothing, calls nothing but its own origin,
 * writes nothing, and has no quota to exhaust. The worst an abusive client can
 * do is read files that are already public at their own URLs.
 *
 * JSON-RPC 2.0 over the Streamable HTTP transport. Deliberately minimal: no
 * sessions, no server-initiated messages, no subscriptions. A stateless
 * request-response server is a complete MCP server for read-only data, and
 * every piece of state omitted is a piece that cannot go wrong.
 *
 * Every failure path returns a JSON-RPC error object. Nothing here throws to
 * the runtime, because a 500 from an MCP server presents to the agent as "the
 * tool is broken" rather than as "that argument was wrong".
 */

/** Versions this server implements, newest first. */
const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'] as const;

const SERVER = { name: 'sighttrue', version: '1.0.0' } as const;

/** Beyond this an argument is not a package name, it is an attack. */
const MAX_NAME = 200;

/** One agent call must not be able to ask for the whole watchlist. */
const MAX_BATCH = 100;
const MAX_RESULTS = 50;

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

import { hashToken } from '../../src/lib/auth.ts';

/**
 * The one query this server makes, as a shape rather than as Cloudflare's type.
 *
 * `tests/mcp.test.ts` imports this module, which puts it in the same
 * typechecking pass as `src/`, where the Workers globals are not declared.
 * Importing `Env` for one method dragged `D1Database` into a config that has
 * never needed it. What is actually used is one prepared statement.
 */
interface KeyStore {
  prepare(query: string): {
    bind(...values: unknown[]): { first<T>(): Promise<T | null> };
  };
}
import { bearerFrom, decide, type EntitlementRow } from '../../src/lib/entitlement.ts';
import { MCP_TOOLS, toolByName } from '../../src/lib/mcp-catalogue.ts';
import { PAGED_IDS, WATCHABLE_IDS } from '../../src/lib/registries-table.ts';
import { NOT_LAUNCHED, paymentRequired, paymentStatus } from '../../src/lib/x402.ts';

/**
 * The payment rail, unset.
 *
 * There is no $SGHT contract and no rate, so `paymentRequired` returns null and
 * the refusal says so in words instead of quoting terms nobody agreed. One
 * constant changes when the token is deployed; nothing else here does.
 */
const PAYMENT = NOT_LAUNCHED;
import {
  findEntry,
  noticesFor,
  type VerdictEntry,
  type VerdictRegistry,
} from '../../src/lib/verdict.ts';

/**
 * The registries an agent may ask about.
 *
 * Read from `registries-table.ts` rather than written out here. This file used
 * to name three, so the day RubyGems opened an agent asking about `gem:rails`
 * got "registry must be one of npm, pypi, crates" about a package the rest of
 * the project had five readings on.
 */
const MCP_REGISTRIES: readonly string[] = WATCHABLE_IDS;

/** Registries whose packages have a page here. Maven's names are not URLs. */
const PAGED_REGISTRIES: ReadonlySet<string> = new Set(PAGED_IDS);

interface StackEntry {
  repo: string;
  installs: number | null;
  scorecard: number | null;
  advisories: number | null;
  license: string | null;
  archived: boolean;
  pushedAt: string | null;
}

interface CompareRow {
  id: string;
  name: string;
  category: string;
  language: string | null;
  forks: number;
  stars: number;
  installs: number | null;
  scorecard: number | null;
  advisories: number | null;
  findings: number;
}

interface IncidentBundle {
  generatedAt: string;
  incidents: {
    provider: string;
    title: string;
    startedAt: string | null;
    resolvedAt: string | null;
    updatedAt: string;
    /** The provider's own grading: none, minor, major, critical. */
    impact: string | null;
    /** Null where no status was ever on record — not the same as unresolved. */
    resolved: boolean | null;
    url: string;
  }[];
}

type IncidentEntry = IncidentBundle['incidents'][number];

/**
 * Where the incident sits in time: the published start, or the last update when
 * the provider published no start. Rows kept from before this project read the
 * JSON API have only the second.
 */
function incidentAt(row: IncidentEntry): string | null {
  const at = row.startedAt ?? row.updatedAt ?? null;
  return typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : null;
}

/** Only where the provider published both ends. Never measured from a guess. */
function incidentMinutes(row: IncidentEntry): number | null {
  if (row.startedAt === null || row.resolvedAt === null) return null;
  const from = Date.parse(row.startedAt);
  const to = Date.parse(row.resolvedAt);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 60_000);
}

/**
 * Minutes covered by these incidents between them, overlaps merged.
 *
 * Summing durations instead double-counts a provider that files three records
 * for one bad afternoon, and an agent given that number will repeat it.
 */
function openMinutes(rows: readonly IncidentEntry[]): number {
  const spans = rows
    .map((row) => [Date.parse(row.startedAt ?? ''), Date.parse(row.resolvedAt ?? '')] as const)
    .filter(([from, to]) => Number.isFinite(from) && Number.isFinite(to) && to >= from)
    .sort((a, b) => a[0] - b[0]);

  let total = 0;
  let from: number | null = null;
  let to = 0;

  for (const [start, end] of spans) {
    if (from === null) {
      from = start;
      to = end;
    } else if (start <= to) to = Math.max(to, end);
    else {
      total += to - from;
      from = start;
      to = end;
    }
  }

  if (from !== null) total += to - from;
  return Math.round(total / 60_000);
}

interface EolBundle {
  generatedAt: string;
  products: {
    product: string;
    cycle: string;
    eol: string | null;
    ended: boolean;
    latest: string | null;
    lts: boolean;
  }[];
}

interface StackIndex {
  benchmark: { repositories: number; medianScorecard: number | null; scored: number };
  packages: Record<string, StackEntry>;
}

const HEADERS = {
  'content-type': 'application/json',
  // Agents run in browsers as often as not, and this data is public at its own
  // URLs anyway — there is nothing here that same-origin policy would protect.
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type, mcp-protocol-version',
  'access-control-allow-methods': 'POST, OPTIONS',
  'cache-control': 'no-store',
};

function result(id: unknown, value: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result: value }), {
    headers: HEADERS,
  });
}

/**
 * A JSON-RPC error, always with HTTP 200.
 *
 * The transport succeeded; the call did not. Returning 4xx here makes clients
 * report a broken server rather than a rejected argument, and the difference
 * matters when the caller is an agent deciding whether to retry.
 */
function failure(id: unknown, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), {
    headers: HEADERS,
  });
}

/** Tool results are content blocks, and an error is a flag rather than a throw. */
function toolResult(id: unknown, payload: unknown, isError = false): Response {
  return result(id, {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    isError,
  });
}

/**
 * The entitlement behind an Authorization header, or null.
 *
 * Null covers every way of not having one — no header, a malformed one, a key
 * that was revoked, a key with no entitlement row. They are one answer here
 * because `decide` treats them alike: a paid tool is refused and a free tool is
 * not, and distinguishing "wrong key" from "no key" in the reply would tell an
 * attacker which of their guesses was a real key.
 *
 * The database is optional. This server ran without D1 bound for its whole life
 * and its free tools must keep working if the binding ever goes missing — an
 * outage in the paid path is not a reason to stop answering the public one.
 */
async function entitlementFor(
  context: { env?: { DB?: KeyStore } },
  header: string | null,
): Promise<EntitlementRow | null> {
  const key = bearerFrom(header);
  const db = context.env?.DB;
  if (key === null || db === undefined) return null;

  try {
    const hash = await hashToken(key);
    const row = await db
      .prepare(
        `SELECT e.plan_id, e.valid_until, e.calls_remaining
           FROM api_keys k
           JOIN entitlements e ON e.account_id = k.account_id
          WHERE k.key_hash = ? AND k.revoked_at IS NULL`,
      )
      .bind(hash)
      .first<{ plan_id: string; valid_until: string | null; calls_remaining: number | null }>();

    if (row === null) return null;
    return {
      planId: row.plan_id,
      validUntil: row.valid_until,
      callsRemaining: row.calls_remaining,
    };
  } catch {
    // A database that cannot be read is not an entitlement. Refusing the paid
    // tools is the safe direction; throwing would take the free ones down too.
    return null;
  }
}

function asString(value: unknown, max = MAX_NAME): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > max) return null;
  return trimmed;
}

/**
 * What every answer here is qualified by.
 *
 * Returned with each tool result rather than documented once, because an agent
 * reads one result and not the documentation, and a figure quoted without its
 * limits is the failure this whole surface exists to avoid.
 */
const LIMITS = [
  'The watchlist is curated and partial, around 420 repositories chosen by hand. A package that is not covered is not being judged; it is simply not tracked.',
  'Scorecards are the OpenSSF Scorecard published by Google Open Source Insights, not computed here. They measure declared practices such as code review and workflow permissions, and a low score is not a statement that a project is unsafe.',
  'Advisory counts are OSV totals for all time, so a mature well-patched project carries more than a young one. A high count is not a warning on its own.',
  'Readings are taken every four hours at best. Nothing here is real-time.',
];

/**
 * Declared from `mcp-catalogue.ts` rather than written here.
 *
 * These were spelled out inline, and the pricing page counted them in a
 * different file. It said seven while the server answered eight, and a test
 * pinned the sentence rather than the server, so it held. One list now, read
 * by the endpoint, the page and the gate.
 */
const TOOLS = MCP_TOOLS.map((tool) => ({
  name: tool.name,
  description:
    tool.tier === 'paid'
      ? `${tool.description} Requires a key; see https://sighttrue.com/pricing.`
      : tool.description,
  inputSchema: {
    type: 'object',
    properties: tool.properties,
    required: [...tool.required],
    additionalProperties: false,
  },
}));

async function loadJson<T>(origin: string, path: string): Promise<T | null> {
  try {
    const response = await fetch(`${origin}${path}`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function ageDays(iso: string | null): number | null {
  if (iso === null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? Math.round((Date.now() - at) / 86_400_000) : null;
}

function eolDays(date: string, today: string): number {
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

const SOURCE_AVAILABLE = /BUSL|SSPL|Elastic|RSAL|Commons-Clause|PolyForm/i;

function describe(name: string, entry: StackEntry): Record<string, unknown> {
  const age = ageDays(entry.pushedAt);
  return {
    name,
    covered: true,
    repository: entry.repo,
    weeklyDownloads: entry.installs,
    scorecard: entry.scorecard,
    advisories: entry.advisories,
    license: entry.license,
    licenseIsSourceAvailable: entry.license !== null && SOURCE_AVAILABLE.test(entry.license),
    archived: entry.archived,
    daysSinceLastPush: age,
    url: `https://sighttrue.com/repo/${entry.repo}`,
  };
}

export async function onRequestPost(context: {
  request: Request;
  // Optional, and it has to stay optional. This server answered for months with
  // no database bound, and its free tools must keep answering if the binding
  // disappears.
  env?: { DB?: KeyStore };
}): Promise<Response> {
  const { request } = context;
  const origin = new URL(request.url).origin;

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return failure(null, -32700, 'Parse error: body is not JSON.');
  }

  // Batches are optional in JSON-RPC and this server does not accept them. Said
  // plainly rather than crashing on an array.
  if (Array.isArray(body)) {
    return failure(null, -32600, 'Batched requests are not supported. Send one request.');
  }
  if (body === null || typeof body !== 'object') {
    return failure(null, -32600, 'Invalid request.');
  }

  const id = body.id;
  const method = typeof body.method === 'string' ? body.method : '';
  const params = (body.params ?? {}) as Record<string, unknown>;

  // Notifications carry no id and expect no body.
  if (method.startsWith('notifications/')) return new Response(null, { status: 202 });

  if (method === 'initialize') {
    const asked = typeof params['protocolVersion'] === 'string' ? params['protocolVersion'] : '';
    const version = (PROTOCOL_VERSIONS as readonly string[]).includes(asked)
      ? asked
      : PROTOCOL_VERSIONS[0];

    return result(id, {
      protocolVersion: version,
      capabilities: { tools: {} },
      serverInfo: SERVER,
      instructions:
        'Readings about open-source dependencies, taken every four hours and published as static files. Every figure is measured rather than estimated, and every tool result carries the limits of what it can support. The watchlist is curated and partial: an uncovered package is untracked, not judged.',
    });
  }

  if (method === 'ping') return result(id, {});
  if (method === 'tools/list') return result(id, { tools: TOOLS });

  if (method !== 'tools/call') {
    return failure(id, -32601, `Method not found: ${method || '(none)'}`);
  }

  const toolName = typeof params['name'] === 'string' ? params['name'] : '';
  const args = (params['arguments'] ?? {}) as Record<string, unknown>;

  // The gate, before any tool runs.
  //
  // A tool nobody catalogued is refused rather than dispatched, so a handler
  // added without an entry cannot quietly answer for free. And a free tool is
  // never gated: the decision lives in `decide`, which refuses to withhold one
  // whatever the key says, because everything already published keyless stays
  // keyless.
  const declared = toolByName(toolName);
  if (declared === undefined) {
    return toolResult(id, { error: `No tool named ${toolName || '(none)'}. Call list_readings.` }, true);
  }

  const entitlement = await entitlementFor(context, request.headers.get('authorization'));
  const decision = decide(declared.tier, entitlement, new Date().toISOString());
  if (!decision.allowed) {
    // A key is one way in. The other is paying for the single call, which is
    // the only route a caller with no human behind it can take — an agent has
    // no card, no billing address and no way through a 3DS challenge. When a
    // price exists, the refusal carries what to pay and where, per x402, so the
    // agent can settle and retry without anybody signing up for anything.
    const required = paymentRequired(declared, origin, PAYMENT);
    return toolResult(
      id,
      {
        error: decision.message,
        tool: toolName,
        tier: declared.tier,
        ...(required === null ? { payment: paymentStatus(PAYMENT) } : { paymentRequired: required }),
      },
      true,
    );
  }

  if (toolName === 'list_readings') {
    return toolResult(id, {
      tools: MCP_TOOLS.map((tool) => ({
        name: tool.name,
        tier: tool.tier,
        group: tool.group,
        measures: tool.description,
        // Why it is not available elsewhere. An agent choosing between this and
        // its own training data deserves to know which one was measured today.
        because: tool.because,
      })),
      note: 'Tools marked free need no key. The rest need one; see https://sighttrue.com/pricing.',
    });
  }

  if (toolName === 'check_before_install') {
    const registry = asString(args['registry'], 12);
    if (registry === null || !MCP_REGISTRIES.includes(registry)) {
      return toolResult(id, { error: `registry must be one of ${MCP_REGISTRIES.join(', ')}.` }, true);
    }
    const name = asString(args['name']);
    if (name === null) {
      return toolResult(id, { error: 'name is required and must be a string.' }, true);
    }

    const index = await loadJson<StackIndex>(origin, '/data/stack-index.json');
    if (index === null) {
      return toolResult(id, { error: 'The readings could not be loaded.' }, true);
    }

    const wanted = { registry: registry as VerdictRegistry, name };
    const found = findEntry(index.packages as Record<string, VerdictEntry>, wanted);

    if (found === null) {
      return toolResult(id, {
        package: `${registry}:${name}`,
        covered: false,
        notices: [],
        note: 'Not on the watchlist, so nothing has been collected for it. This is not a judgement about the package, and an empty notices list here means nothing was checked rather than nothing was found.',
        limits: LIMITS,
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const notices = noticesFor(wanted, found.entry, today);

    return toolResult(id, {
      package: `${registry}:${name}`,
      covered: true,
      repository: found.entry.repo,
      // Null where no page exists. Maven names are `group:artifact` and get no
      // page, so building one from the key handed an agent a URL that has never
      // been published — and an agent quotes what it is given.
      page: PAGED_REGISTRIES.has(registry) ? `${origin}/${found.key.replace(':', '/')}` : null,
      notices,
      // Never "clear" or "ok". An agent handed a field called `safe` will
      // report the package as safe, which is a claim nothing here supports.
      note:
        notices.length === 0
          ? 'Nothing on the short list above is on record for this package. That is not a statement that it is safe to install — it means these particular facts are absent, from a curated watchlist, in readings taken up to four hours ago.'
          : 'Each notice is a fact on record with the address of the body that published it. None of them is a recommendation; whether any of them should stop the install is the reviewer’s call.',
      limits: LIMITS,
    });
  }

  if (toolName === 'check_package' || toolName === 'check_stack') {
    const registry = asString(args['registry'], 12);
    if (registry === null || !MCP_REGISTRIES.includes(registry)) {
      return toolResult(id, { error: `registry must be one of ${MCP_REGISTRIES.join(', ')}.` }, true);
    }

    const index = await loadJson<StackIndex>(origin, '/data/stack-index.json');
    if (index === null) {
      return toolResult(id, { error: 'The readings could not be loaded.' }, true);
    }

    if (toolName === 'check_package') {
      // Says which of the two it was. "name is required" for a name that was
      // supplied but is 5,000 characters long tells an agent to retry with the
      // same argument, and it will.
      const name = asString(args['name']);
      if (name === null) {
        return toolResult(
          id,
          {
            error:
              typeof args['name'] === 'string'
                ? `name must be between 1 and ${MAX_NAME} characters.`
                : 'name is required and must be a string.',
          },
          true,
        );
      }

      const entry = index.packages[`${registry}:${name}`];
      return toolResult(id, {
        ...(entry === undefined
          ? {
              name,
              covered: false,
              note: 'Not on the watchlist. This is not a judgement about the package — it is not tracked here.',
            }
          : describe(name, entry)),
        limits: LIMITS,
      });
    }

    const raw = args['names'];
    if (!Array.isArray(raw)) return toolResult(id, { error: 'names must be an array.' }, true);
    if (raw.length > MAX_BATCH) {
      return toolResult(id, { error: `names is limited to ${MAX_BATCH} entries.` }, true);
    }

    const wanted = raw.map((value) => asString(value)).filter((value): value is string => value !== null);
    const covered = wanted
      .map((name) => ({ name, entry: index.packages[`${registry}:${name}`] }))
      .filter((row): row is { name: string; entry: StackEntry } => row.entry !== undefined)
      .map((row) => describe(row.name, row.entry));

    const scored = covered
      .map((row) => row['scorecard'])
      .filter((score): score is number => typeof score === 'number')
      .sort((x, y) => x - y);

    return toolResult(id, {
      read: wanted.length,
      covered: covered.length,
      uncovered: wanted.length - covered.length,
      flags: {
        archived: covered.filter((row) => row['archived'] === true).map((row) => row['name']),
        sourceAvailableLicence: covered
          .filter((row) => row['licenseIsSourceAvailable'] === true)
          .map((row) => row['name']),
        withAdvisories: covered
          .filter((row) => typeof row['advisories'] === 'number' && (row['advisories'] as number) > 0)
          .map((row) => row['name']),
        notPushedInAYear: covered
          .filter(
            (row) =>
              typeof row['daysSinceLastPush'] === 'number' &&
              (row['daysSinceLastPush'] as number) > 365,
          )
          .map((row) => row['name']),
      },
      medianScorecard: scored.length === 0 ? null : scored[Math.floor(scored.length / 2)],
      benchmarkMedianScorecard: index.benchmark.medianScorecard,
      benchmarkRepositories: index.benchmark.repositories,
      packages: covered,
      limits: LIMITS,
    });
  }

  if (toolName === 'find_model') {
    const models = await loadJson<
      {
        id: string;
        provider: string;
        prompt: number | null;
        completion: number | null;
        context: number | null;
        firstSeen: string;
      }[]
    >(origin, '/data/models.json');

    if (models === null) {
      return toolResult(id, { error: 'The catalogue could not be loaded.' }, true);
    }

    const minContext = typeof args['minContext'] === 'number' ? args['minContext'] : 0;
    const maxPrice =
      typeof args['maxPrice'] === 'number' ? args['maxPrice'] : Number.POSITIVE_INFINITY;
    const provider = asString(args['provider'], 60)?.toLowerCase() ?? null;
    const sort = asString(args['sort'], 24) ?? 'price';
    const limitRaw = args['limit'];
    const limit =
      typeof limitRaw === 'number' && Number.isFinite(limitRaw)
        ? Math.min(MAX_RESULTS, Math.max(1, Math.floor(limitRaw)))
        : 10;

    // Free tiers are excluded. Zero is a different offer — rate-limited, often
    // a preview — and returning it as the cheapest would answer the question
    // asked with something that is not an answer to it.
    const matched = models
      .filter(
        (model) =>
          typeof model.prompt === 'number' &&
          model.prompt > 0 &&
          model.prompt <= maxPrice &&
          (model.context ?? 0) >= minContext &&
          (provider === null || model.provider.toLowerCase() === provider),
      )
      .map((model) => ({
        ...model,
        perContext:
          model.context === null || model.context <= 0
            ? null
            : Math.round(((model.prompt as number) / (model.context / 100_000)) * 1_000_000) /
              1_000_000,
      }));

    matched.sort((a, b) => {
      if (sort === 'context') return (b.context ?? 0) - (a.context ?? 0);
      if (sort === 'price-per-context') {
        return (a.perContext ?? Infinity) - (b.perContext ?? Infinity);
      }
      return (a.prompt as number) - (b.prompt as number);
    });

    return toolResult(id, {
      matched: matched.length,
      returned: Math.min(limit, matched.length),
      sortedBy: sort,
      units: {
        prompt: 'USD per million prompt tokens',
        perContext: 'USD per million prompt tokens, per 100k of context window',
      },
      models: matched.slice(0, limit),
      limits: [
        'Prices are read daily from one catalogue and are what that catalogue reports, not what a provider bills you — quotas, batch tiers and negotiated rates are not visible here.',
        'Free tiers are excluded. Zero is a different offer rather than a lower price.',
        'A context window is what the catalogue advertises. It is not a statement about how well a model uses it.',
      ],
    });
  }

  if (toolName === 'check_eol') {
    const product = asString(args['product'], 60)?.toLowerCase() ?? null;
    if (product === null) {
      return toolResult(id, { error: 'product is required, e.g. python.' }, true);
    }

    const bundle = await loadJson<EolBundle>(origin, '/data/eol.json');
    if (bundle === null) {
      return toolResult(id, { error: 'The dates could not be loaded.' }, true);
    }

    const all = bundle.products.filter((row) => row.product === product);
    if (all.length === 0) {
      return toolResult(id, {
        product,
        covered: false,
        note: 'Not tracked here. This says nothing about the product; the list is curated.',
        tracked: [...new Set(bundle.products.map((row) => row.product))].sort(),
      });
    }

    const cycle = asString(args['cycle'], 40);
    const asked = cycle === null ? all : all.filter((row) => row.cycle === cycle);

    if (cycle !== null && asked.length === 0) {
      return toolResult(
        id,
        {
          product,
          cycle,
          covered: false,
          error: 'That release line is not on record.',
          cycles: all.map((row) => row.cycle),
        },
        true,
      );
    }

    // Sorted by how soon each one matters. An ended cycle first, then the
    // nearest date, then the ones with no announced end.
    const today = new Date().toISOString().slice(0, 10);
    const releases = asked
      .map((row) => ({
        cycle: row.cycle,
        supported: !row.ended,
        eol: row.eol,
        daysRemaining: row.eol === null ? null : eolDays(row.eol, today),
        latest: row.latest,
        lts: row.lts,
      }))
      .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity));

    return toolResult(id, {
      product,
      covered: true,
      asOf: bundle.generatedAt,
      // Every supported cycle of the product, not only the ones asked about.
      // Filtered to the question, a query for python 3.9 answered
      // `supportedCycles: []` — true of the row asked for and read as "python
      // has nothing supported", which is the opposite of the answer. This
      // field is the "what do I move to" half and it is useless narrowed.
      supportedCycles: all.filter((row) => !row.ended).map((row) => row.cycle),
      releases,
      source: `https://endoflife.date/${product}`,
      limits: [
        'Dates are published by endoflife.date and republished here unchanged. Nothing is inferred.',
        'A release with no announced end date is reported as having none, which is not the same as being supported indefinitely.',
        'The product list is curated — about two dozen runtimes, databases and frameworks, not the whole catalogue.',
      ],
    });
  }

  if (toolName === 'check_provider') {
    const bundle = await loadJson<IncidentBundle>(origin, '/data/incidents.json');
    if (bundle === null) {
      return toolResult(id, { error: 'The incident record could not be loaded.' }, true);
    }

    const daysRaw = args['days'];
    const days =
      typeof daysRaw === 'number' && Number.isFinite(daysRaw)
        ? Math.min(730, Math.max(1, Math.floor(daysRaw)))
        : 90;

    const since = Date.now() - days * 86_400_000;
    const wanted = asString(args['provider'], 40)?.toLowerCase() ?? null;

    const dated = bundle.incidents
      .map((row) => ({ row, at: incidentAt(row) }))
      .filter((entry): entry is { row: IncidentEntry; at: string } => entry.at !== null);

    const inWindow = dated.filter((entry) => Date.parse(entry.at) >= since);
    const tracked = [...new Set(bundle.incidents.map((row) => row.provider))].sort();

    if (wanted !== null && !tracked.includes(wanted)) {
      return toolResult(
        id,
        {
          provider: wanted,
          covered: false,
          error: 'Not tracked here, or it has never announced an incident on record.',
          tracked,
        },
        true,
      );
    }

    const scoped =
      wanted === null ? inWindow : inWindow.filter((entry) => entry.row.provider === wanted);
    const counts: Record<string, number> = {};
    for (const entry of scoped) {
      counts[entry.row.provider] = (counts[entry.row.provider] ?? 0) + 1;
    }

    const lengths = scoped
      .map((entry) => incidentMinutes(entry.row))
      .filter((minutes): minutes is number => minutes !== null)
      .sort((a, b) => a - b);

    return toolResult(id, {
      windowDays: days,
      asOf: bundle.generatedAt,
      ...(wanted === null ? { tracked } : { provider: wanted }),
      total: scoped.length,
      byProvider: Object.fromEntries(
        Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      ),
      // Announced length, over the subset that published both ends. The
      // denominator ships with the number so it cannot be quoted as if it
      // covered every incident.
      timed: lengths.length,
      medianMinutes: lengths.length === 0 ? null : (lengths[Math.floor(lengths.length / 2)] ?? null),
      // Minutes with a record open, overlaps merged. Named for what it is: an
      // agent handed a field called "downtime" will report downtime.
      minutesWithAnIncidentOpen: openMinutes(scoped.map((entry) => entry.row)),
      minutesGradedMajorOrCritical: openMinutes(
        scoped
          .map((entry) => entry.row)
          .filter((row) => row.impact === 'major' || row.impact === 'critical'),
      ),
      incidents: scoped
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, MAX_RESULTS)
        .map(({ row }) => ({
          provider: row.provider,
          title: row.title,
          startedAt: row.startedAt,
          resolvedAt: row.resolvedAt,
          minutes: incidentMinutes(row),
          impact: row.impact,
          resolved: row.resolved,
          url: row.url,
        })),
      limits: [
        'These are the providers’ own announcements, republished unchanged. Nothing here is measured independently.',
        'A count is how often a provider announced something, not how often it broke. One that publishes every degradation will out-count one that publishes nothing, so a low count is not a good sign on its own.',
        'Unresolved covers both "still going" and "never closed out", which this cannot tell apart. A null resolved is neither: it means no status was ever on record for that row.',
        'A null startedAt is a row kept from before this read the providers’ JSON, where only the time of their last update survives. It is dated by that and has no length.',
        'Length is the gap between the start and resolution the provider published, not a measure of how long anything was broken, and it covers only the incidents where they published both.',
        'minutesWithAnIncidentOpen is not downtime and must not be reported as downtime or as uptime. An open incident usually affects one component or one region while everything else keeps serving, and the clock runs until the provider closes the record, which is after the impact ends. Overlapping incidents are merged, so it is not a sum of the lengths above.',
        'impact is the provider’s own grading — none, minor, major or critical — and is null where the source publishes no grading, which is not the same as an incident being minor.',
        'History only goes back as far as this project has been keeping it, which is shorter than the providers have existed.',
      ],
    });
  }

  if (toolName === 'compare_repositories' || toolName === 'search_repositories') {
    const rows = await loadJson<CompareRow[]>(origin, '/data/compare.json');
    if (rows === null) {
      return toolResult(id, { error: 'The readings could not be loaded.' }, true);
    }

    if (toolName === 'compare_repositories') {
      const a = asString(args['a']);
      const b = asString(args['b']);
      if (a === null || b === null) {
        return toolResult(id, { error: 'a and b are required, as owner/name.' }, true);
      }

      const find = (id_: string): CompareRow | undefined =>
        rows.find((row) => row.id.toLowerCase() === id_.toLowerCase());
      const rowA = find(a);
      const rowB = find(b);

      if (rowA === undefined || rowB === undefined) {
        return toolResult(
          id,
          {
            error: 'Not on the watchlist.',
            missing: [rowA === undefined ? a : null, rowB === undefined ? b : null].filter(Boolean),
            hint: 'Use search_repositories to find what is covered.',
          },
          true,
        );
      }

      return toolResult(id, {
        a: rowA,
        b: rowB,
        note: 'This compares and does not rank. Nothing is totalled across measures that share no unit, and neither side is a winner.',
        limits: LIMITS,
      });
    }

    const query = asString(args['query']);
    if (query === null) return toolResult(id, { error: 'query is required.' }, true);

    const limitRaw = args['limit'];
    const limit =
      typeof limitRaw === 'number' && Number.isFinite(limitRaw)
        ? Math.min(MAX_RESULTS, Math.max(1, Math.floor(limitRaw)))
        : 20;

    const needle = query.toLowerCase();
    const matches = rows.filter((row) => row.id.toLowerCase().includes(needle));

    return toolResult(id, {
      query,
      matched: matches.length,
      returned: Math.min(limit, matches.length),
      repositories: matches.slice(0, limit),
      limits: LIMITS,
    });
  }

  return failure(id, -32602, `Unknown tool: ${toolName || '(none)'}`);
}

/** Preflight, for agents running in a browser. */
export function onRequestOptions(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

/** Anything else. GET included — this transport is POST-only by design. */
export function onRequest(): Response {
  return failure(null, -32600, 'POST a JSON-RPC 2.0 request. This server implements MCP.');
}
