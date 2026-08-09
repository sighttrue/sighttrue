/**
 * Who actually goes down, and how often.
 *
 * Every provider here publishes an incident record and every one of those
 * records disappears. Statuspage carries fifty and drops the rest, so "how often
 * has this gone down" has no answer anywhere a season later — which is how a
 * provider's reputation ends up being whatever people remember about the last
 * bad week.
 *
 * Nothing is judged and nothing is scored. These are their own announcements,
 * kept after they stopped keeping them, counted and put side by side. A count
 * is not a reliability rating: a provider that publishes every degradation
 * honestly will out-count one that publishes nothing, and the page has to say
 * so wherever the number appears.
 *
 * Deliberately no events. GitHub alone files incidents most weeks, and a
 * finding per incident would bury every other signal in the product under
 * somebody else's operational noise. The value here is the record, not an
 * alert.
 *
 * ── Why this reads JSON and not the RSS feed
 *
 * It read `history.rss` until 2026-08-08 and stored each item's `pubDate` as
 * `startedAt`. A pubDate is the time of the item's most recent update, so for a
 * resolved incident it is the time it *ended*. Checked against Statuspage's own
 * JSON for every row that could still be checked, 369 of 379 stored timestamps
 * matched `resolved_at` exactly and none matched `started_at`. The site was
 * publishing resolution times as incident dates, and nothing ever failed — a
 * field holding the wrong thing does not throw.
 *
 * `/api/v2/incidents.json` returns `started_at` and `resolved_at` as separate
 * fields, which fixes that and makes a duration computable for the first time.
 * It carries a second correction with it: the RSS history feed mixes scheduled
 * maintenance in with incidents, and the JSON incidents endpoint does not.
 * Fifty maintenance windows — every Twilio row, three quarters of Cloudflare's
 * — were being counted and rendered as announced incidents, some of them dated
 * in the future. See `scripts/migrate-incidents.ts`.
 */

import { incidentAt, type IncidentRow } from '../types/incidents.ts';
import { sleep } from '../lib/registries.ts';

const USER_AGENT = 'sighttrue-agent (+https://github.com/sighttrue/sighttrue)';

/**
 * `statuspage` is Atlassian's product and its clones, which answer
 * `/api/v2/incidents.json`. `heroku` is its own API and the only provider here
 * that needs a second reader.
 */
export type ProviderKind = 'statuspage' | 'heroku' | 'google';

export interface Provider {
  slug: string;
  name: string;
  /** Status site origin, no trailing slash. Every other URL derives from it. */
  host: string;
  kind: ProviderKind;
}

/**
 * Curated, and every host verified rather than guessed.
 *
 * Several of these are not the obvious hostname — Anthropic's status site is
 * status.claude.com, Fly's is status.flyio.net — and rediscovering that through
 * a redirect chain on every run is a request spent to learn something already
 * known.
 */
export const PROVIDERS: readonly Provider[] = [
  { slug: 'openai', name: 'OpenAI', host: 'https://status.openai.com', kind: 'statuspage' },
  { slug: 'anthropic', name: 'Anthropic', host: 'https://status.claude.com', kind: 'statuspage' },
  { slug: 'github', name: 'GitHub', host: 'https://www.githubstatus.com', kind: 'statuspage' },
  {
    slug: 'cloudflare',
    name: 'Cloudflare',
    host: 'https://www.cloudflarestatus.com',
    kind: 'statuspage',
  },
  { slug: 'npm', name: 'npm', host: 'https://status.npmjs.org', kind: 'statuspage' },
  { slug: 'vercel', name: 'Vercel', host: 'https://www.vercel-status.com', kind: 'statuspage' },
  { slug: 'supabase', name: 'Supabase', host: 'https://status.supabase.com', kind: 'statuspage' },
  {
    slug: 'digitalocean',
    name: 'DigitalOcean',
    host: 'https://status.digitalocean.com',
    kind: 'statuspage',
  },
  { slug: 'fly-io', name: 'Fly.io', host: 'https://status.flyio.net', kind: 'statuspage' },
  { slug: 'render', name: 'Render', host: 'https://status.render.com', kind: 'statuspage' },
  { slug: 'netlify', name: 'Netlify', host: 'https://www.netlifystatus.com', kind: 'statuspage' },
  { slug: 'upstash', name: 'Upstash', host: 'https://status.upstash.com', kind: 'statuspage' },
  { slug: 'mongodb', name: 'MongoDB', host: 'https://status.mongodb.com', kind: 'statuspage' },
  { slug: 'twilio', name: 'Twilio', host: 'https://status.twilio.com', kind: 'statuspage' },
  { slug: 'discord', name: 'Discord', host: 'https://discordstatus.com', kind: 'statuspage' },
  { slug: 'sentry', name: 'Sentry', host: 'https://status.sentry.io', kind: 'statuspage' },
  { slug: 'groq', name: 'Groq', host: 'https://groqstatus.com', kind: 'statuspage' },
  { slug: 'heroku', name: 'Heroku', host: 'https://status.heroku.com', kind: 'heroku' },
  { slug: 'datadog', name: 'Datadog', host: 'https://status.datadoghq.com', kind: 'statuspage' },
  { slug: 'atlassian', name: 'Atlassian', host: 'https://status.atlassian.com', kind: 'statuspage' },
  // Two more businesses depend on than on most of the list above. Stripe runs
  // Statuspage like the rest, so it costs no new code; Google publishes its own
  // shape and gets its own reader below.
  { slug: 'stripe', name: 'Stripe', host: 'https://www.stripestatus.com', kind: 'statuspage' },
  {
    slug: 'google-cloud',
    name: 'Google Cloud',
    host: 'https://status.cloud.google.com',
    kind: 'google',
  },
];

/**
 * Railway is absent.
 *
 * Its status page is Instatus rather than Statuspage and publishes only the
 * current state, with no incident history in any format — so that one is a
 * genuine gap in coverage rather than a statement about the service.
 */

/** How long an incident stays on record here after the provider drops it. */
export const RETAIN_DAYS = 730;

export const DELAY_MS = 150;

export function apiUrl(provider: Provider): string {
  if (provider.kind === 'heroku') return `${provider.host}/api/v4/incidents`;
  if (provider.kind === 'google') return `${provider.host}/incidents.json`;
  return `${provider.host}/api/v2/incidents.json`;
}

/**
 * Where a reader can check the claim.
 *
 * Built from the host rather than taken from the payload: two of these pages
 * publish their own URL with a trailing slash, which produced ids containing
 * `//incidents/` for as long as this read the feed.
 */
export function incidentUrl(provider: Provider, id: string): string {
  return `${provider.host}/incidents/${id}`;
}

export interface IncidentClient {
  json(url: string): Promise<unknown | null>;
  requests(): number;
}

export function createIncidentClient(): IncidentClient {
  let spent = 0;
  return {
    requests: () => spent,
    async json(url) {
      spent += 1;
      const response = await fetch(url, {
        headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
      });
      if (!response.ok) return null;
      try {
        return await response.json();
      } catch {
        // A status page serving HTML from a JSON path is a status page having a
        // bad day. Reads as unavailable, which keeps what is already on record.
        return null;
      }
    },
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** A timestamp only counts if it parses. A string that does not is not a date. */
function stamp(value: unknown): string | null {
  const raw = text(value);
  if (raw === null) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/**
 * Statuspage and the pages that copy its API.
 *
 * `started_at` is absent from two of them — OpenAI and Groq run a
 * Statuspage-compatible service that publishes `created_at` only. On those the
 * incident's first update carries the same timestamp as `created_at`, so the
 * record was opened when it began and the fallback is the start rather than a
 * stand-in for it.
 */
export function parseStatuspage(payload: unknown, provider: Provider): IncidentRow[] {
  const incidents = (payload as { incidents?: unknown })?.incidents;
  if (!Array.isArray(incidents)) return [];

  const rows: IncidentRow[] = [];

  for (const entry of incidents) {
    const record = entry as Record<string, unknown>;

    const id = text(record['id']);
    const title = text(record['name']);
    if (id === null || title === null) continue;

    const startedAt = stamp(record['started_at']) ?? stamp(record['created_at']);
    const resolvedAt = stamp(record['resolved_at']);
    const updatedAt = stamp(record['updated_at']) ?? resolvedAt ?? startedAt;
    if (updatedAt === null) continue;

    // `postmortem` is resolved with a write-up published afterwards. Reading it
    // as unresolved would report a closed incident as still running.
    const status = text(record['status'])?.toLowerCase() ?? null;
    const url = incidentUrl(provider, id);

    rows.push({
      provider: provider.slug,
      id: url,
      title,
      startedAt,
      resolvedAt,
      updatedAt,
      // Their grading, lowercased and otherwise untouched. `none` is a real
      // value here and means the provider filed something it considered
      // non-impacting, which is different from not having said.
      impact: text(record['impact'])?.toLowerCase() ?? null,
      resolved: status === 'resolved' || status === 'postmortem' || resolvedAt !== null,
      url,
    });
  }

  return rows;
}

/**
 * Heroku, which is not Statuspage.
 *
 * Two of its fields cannot be used. `resolved` is false on every record in the
 * feed including the ones whose `state` is `resolved`, and `duration` disagrees
 * with the timestamps by minutes to hours — so state is read for whether it
 * ended, and `resolved_at` is taken only when Heroku publishes one. It often
 * does not, which is a closed incident with no published end, and that is
 * recorded as exactly that rather than filled in from the last update.
 */
export function parseHeroku(payload: unknown, provider: Provider): IncidentRow[] {
  if (!Array.isArray(payload)) return [];

  const rows: IncidentRow[] = [];

  for (const entry of payload) {
    const record = entry as Record<string, unknown>;

    const rawId = record['id'];
    const id = typeof rawId === 'number' ? String(rawId) : text(rawId);
    const title = text(record['title']);
    if (id === null || title === null) continue;

    const startedAt = stamp(record['created_at']);
    const resolvedAt = stamp(record['resolved_at']);
    const updatedAt = stamp(record['updated_at']) ?? resolvedAt ?? startedAt;
    if (updatedAt === null) continue;

    const url = text(record['full_url']) ?? incidentUrl(provider, id);

    rows.push({
      provider: provider.slug,
      id: url,
      title,
      startedAt,
      resolvedAt,
      updatedAt,
      // Heroku grades nothing. Null is unpublished, not "not serious", and
      // nothing downstream may read it as the second.
      impact: null,
      resolved: text(record['state'])?.toLowerCase() === 'resolved',
      url,
    });
  }

  return rows;
}

/**
 * Google Cloud, which publishes a bare array and its own vocabulary.
 *
 * The fields line up better than Statuspage's did: `begin` and `end` are the
 * two timestamps this project had to switch sources to obtain elsewhere, and
 * they are exactly what they say. `severity` is low, medium or high rather than
 * minor, major or critical — kept in Google's own words rather than translated,
 * because the field is documented as the provider's grading and a translation
 * would make it this project's.
 */
export function parseGoogle(payload: unknown, provider: Provider): IncidentRow[] {
  if (!Array.isArray(payload)) return [];

  const rows: IncidentRow[] = [];

  for (const entry of payload) {
    const record = entry as Record<string, unknown>;

    const id = text(record['id']);
    const title = text(record['external_desc']);
    if (id === null || title === null) continue;

    const startedAt = stamp(record['begin']);
    const resolvedAt = stamp(record['end']);
    const updatedAt = stamp(record['modified']) ?? resolvedAt ?? startedAt;
    if (updatedAt === null) continue;

    // `uri` arrives as a relative path, which is only a URL next to the host.
    const path = text(record['uri']) ?? `incidents/${id}`;
    const url = `${provider.host}/${path.replace(/^\//, '')}`;

    rows.push({
      provider: provider.slug,
      id: url,
      title,
      startedAt,
      resolvedAt,
      updatedAt,
      impact: text(record['severity'])?.toLowerCase() ?? null,
      // Google closes an incident by giving it an end time; there is no status
      // field to read, so the presence of that time is the statement.
      resolved: resolvedAt !== null,
      url,
    });
  }

  return rows;
}

export function parseIncidents(payload: unknown, provider: Provider): IncidentRow[] {
  if (provider.kind === 'heroku') return parseHeroku(payload, provider);
  if (provider.kind === 'google') return parseGoogle(payload, provider);
  return parseStatuspage(payload, provider);
}

export interface IncidentCollectionResult {
  rows: IncidentRow[];
  errors: string[];
  requests: number;
}

export interface IncidentCollectionOptions {
  /** `YYYY-MM-DD` UTC. Anything older than the retention window is dropped. */
  today: string;
  client?: IncidentClient;
  providers?: readonly Provider[];
  delayMs?: number;
  retainDays?: number;
}

export async function collectIncidents(
  previous: readonly IncidentRow[],
  options: IncidentCollectionOptions,
): Promise<IncidentCollectionResult> {
  const client = options.client ?? createIncidentClient();
  const providers = options.providers ?? PROVIDERS;
  const retain = options.retainDays ?? RETAIN_DAYS;
  const errors: string[] = [];

  const cutoff = Date.parse(`${options.today}T00:00:00Z`) - retain * 86_400_000;

  // Keyed by provider and id, so re-reading a provider updates a row rather
  // than duplicating it, and a resolution recorded later replaces the open
  // version.
  const known = new Map(previous.map((row) => [`${row.provider} ${row.id}`, row]));

  for (const [index, provider] of providers.entries()) {
    if (index > 0) await sleep(options.delayMs ?? DELAY_MS);

    let payload: unknown;
    try {
      payload = await client.json(apiUrl(provider));
    } catch (error) {
      errors.push(
        `incidents ${provider.slug}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    if (payload === null) {
      errors.push(`incidents ${provider.slug}: api unavailable`);
      continue;
    }

    const parsed = parseIncidents(payload, provider);
    if (parsed.length === 0) {
      // Either a genuinely spotless provider or a payload that stopped being
      // the shape this reads. Both keep what is already on record; only one of
      // them is worth an error, and this cannot tell which.
      errors.push(`incidents ${provider.slug}: no incidents parsed`);
      continue;
    }

    for (const row of parsed) known.set(`${row.provider} ${row.id}`, row);
  }

  const rows = [...known.values()].filter((row) => {
    const at = incidentAt(row);
    return at !== null && Date.parse(at) >= cutoff;
  });

  return { rows, errors, requests: client.requests() };
}
