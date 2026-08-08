/**
 * Rewrite the incident ledger the RSS reader built.
 *
 * Two faults, one cause — `history.rss` was the wrong source and nobody checked
 * it against the JSON the same hosts publish:
 *
 * 1. **The stored date was the wrong date.** An RSS item's `pubDate` is its last
 *    update, so for a resolved incident it is the time it *ended*. It was stored
 *    as `startedAt` and published as the incident date. Of the 379 rows that
 *    could still be checked against the provider's own API, 369 matched
 *    `resolved_at` exactly and none matched `started_at`.
 * 2. **Half of Twilio and three quarters of Cloudflare were not incidents.** The
 *    RSS history feed mixes scheduled maintenance in with incidents. Fifty
 *    maintenance windows were counted and rendered as announced incidents, some
 *    dated in the future — Twilio's whole record here was carrier maintenance.
 *
 * What this does, per row: ask the provider. Genuine Statuspage hosts answer
 * `/incidents/<id>.json` for incidents long past their 50-item window, and
 * Heroku answers `/api/v4/incidents/<id>`, so almost every row can be corrected
 * from the source rather than adjusted by inference. A record that comes back
 * carrying `scheduled_for` was maintenance and is removed.
 *
 * What it will not do is guess. OpenAI's status site is a Statuspage-compatible
 * clone with no single-incident endpoint, so its rows older than the current
 * window keep the only timestamp they have — now stored as `updatedAt`, which
 * is what a pubDate actually is — and carry no start. A null start reads as
 * unknown everywhere downstream. Moving that value into `startedAt` under a
 * different name would have been the same bug with better paperwork.
 *
 *   node scripts/migrate-incidents.ts            # report only
 *   node scripts/migrate-incidents.ts --write
 */

import {
  apiUrl,
  createIncidentClient,
  DELAY_MS,
  parseIncidents,
  PROVIDERS,
  type Provider,
} from '../src/collectors/incidents.ts';
import { readIncidents, writeIncidents } from '../src/lib/ledger.ts';
import { sleep } from '../src/lib/registries.ts';
import type { IncidentRow } from '../src/types/incidents.ts';

const WRITE = process.argv.includes('--write');

const client = createIncidentClient();
const byProvider = new Map(PROVIDERS.map((provider) => [provider.slug, provider]));

/**
 * The id as this project spells it now.
 *
 * Two shapes have to survive. OpenAI and Groq publish their page URL with a
 * trailing slash, so their RSS guids contain `//incidents/`; Heroku's Atom feed
 * used a `tag:` URI with the incident number on the end. Both become the
 * incident's page URL, which is what every source now agrees on.
 */
function normaliseId(row: IncidentRow, provider: Provider): string {
  const heroku = /Incident\/(\d+)$/.exec(row.id);
  if (heroku !== null) return `${provider.host}/incidents/${heroku[1]}`;
  return row.id.replace(`${provider.host}//incidents/`, `${provider.host}/incidents/`);
}

function keyOf(id: string): string {
  return id.split('/').pop() ?? id;
}

/** The one-at-a-time endpoint, for incidents older than the 50 the list carries. */
function singleUrl(provider: Provider, key: string): string {
  return provider.kind === 'heroku'
    ? `${provider.host}/api/v4/incidents/${key}`
    : `${provider.host}/incidents/${key}.json`;
}

/** Statuspage marks a maintenance window by scheduling it. Incidents are not scheduled. */
function isMaintenance(payload: unknown): boolean {
  const record = payload as Record<string, unknown> | null;
  return typeof record?.['scheduled_for'] === 'string' && record['scheduled_for'] !== '';
}

const held = readIncidents();
const kept: IncidentRow[] = [];

const counts = {
  list: 0,
  single: 0,
  maintenance: 0,
  unrecoverable: 0,
  unknownProvider: 0,
  undated: 0,
};
const samples: string[] = [];

/**
 * A row nothing could be recovered for, kept with the one timestamp it has.
 *
 * That timestamp is a pubDate, which is the last time the provider touched the
 * record — so it goes in `updatedAt` and the start stays null. A row with no
 * timestamp at all cannot be placed in time and is not kept: there is nowhere
 * honest to put it and nothing downstream could date it.
 */
function keepUndatable(row: IncidentRow, id: string, host: string): IncidentRow | null {
  // `startedAt` before this has run, `updatedAt` after it has. Reading both
  // makes a second run a no-op instead of a deletion.
  const stamp = row.startedAt ?? row.updatedAt;
  if (typeof stamp !== 'string' || Number.isNaN(Date.parse(stamp))) return null;
  return {
    ...row,
    id,
    url: row.url === '' ? id : row.url.replace(`${host}//`, `${host}/`),
    startedAt: null,
    resolvedAt: null,
    updatedAt: stamp,
    // Not false. The RSS reader looked for a `Resolved` marker in the item
    // description and missed it on every OpenAI incident — which is what these
    // rows are. Keeping the miss would publish it as sixty-six unresolved
    // outages.
    resolved: null,
  };
}

// One list request per provider first. It answers most rows and costs twenty
// requests rather than five hundred.
const fresh = new Map<string, IncidentRow>();
for (const [index, provider] of PROVIDERS.entries()) {
  if (index > 0) await sleep(DELAY_MS);
  const payload = await client.json(apiUrl(provider));
  if (payload === null) {
    process.stdout.write(`  ${provider.slug}: list unavailable, falling back to one at a time\n`);
    continue;
  }
  for (const row of parseIncidents(payload, provider)) fresh.set(row.id, row);
}

process.stdout.write(`${fresh.size} incidents readable from the provider lists\n\n`);

for (const row of held) {
  const provider = byProvider.get(row.provider);
  if (provider === undefined) {
    // A provider dropped from the watchlist. Its rows stay on record, dated by
    // the only timestamp they have.
    const legacy = keepUndatable(row, row.id, '');
    if (legacy === null) counts.undated += 1;
    else {
      counts.unknownProvider += 1;
      kept.push(legacy);
    }
    continue;
  }

  const id = normaliseId(row, provider);
  const listed = fresh.get(id);

  if (listed !== undefined) {
    counts.list += 1;
    if (samples.length < 6 && listed.startedAt !== null && listed.startedAt !== row.startedAt) {
      samples.push(
        `  ${row.provider} ${keyOf(id)}: stored ${row.startedAt} → started ${listed.startedAt}, resolved ${listed.resolvedAt ?? 'unpublished'}`,
      );
    }
    kept.push(listed);
    continue;
  }

  await sleep(DELAY_MS);
  const payload = await client.json(singleUrl(provider, keyOf(id)));

  if (payload !== null && isMaintenance(payload)) {
    counts.maintenance += 1;
    continue;
  }

  const parsed =
    payload === null
      ? []
      : parseIncidents(
          provider.kind === 'heroku' ? [payload] : { incidents: [payload] },
          provider,
        );

  const one = parsed[0];
  if (one !== undefined) {
    counts.single += 1;
    kept.push(one);
    continue;
  }

  // No endpoint, or the provider no longer serves it. The row survives with the
  // timestamp it has, under the name of the thing that timestamp is.
  const legacy = keepUndatable(row, id, provider.host);
  if (legacy === null) counts.undated += 1;
  else {
    counts.unrecoverable += 1;
    kept.push(legacy);
  }
}

const dated = kept.filter((row) => row.startedAt !== null).length;
const timed = kept.filter((row) => row.startedAt !== null && row.resolvedAt !== null).length;

process.stdout.write(
  [
    `held           ${held.length}`,
    `corrected      ${counts.list} from the provider list, ${counts.single} one at a time`,
    `maintenance    ${counts.maintenance} removed — scheduled windows, never incidents`,
    `unrecoverable  ${counts.unrecoverable} keep their last-update time and no start`,
    counts.unknownProvider > 0 ? `off watchlist  ${counts.unknownProvider}` : '',
    counts.undated > 0 ? `undatable      ${counts.undated} dropped, no usable timestamp` : '',
    `kept           ${kept.length}`,
    `with a start   ${dated}`,
    `with a length  ${timed}`,
    `requests       ${client.requests()}`,
  ]
    .filter((line) => line !== '')
    .join('\n'),
);
process.stdout.write('\n\n');

if (samples.length > 0) {
  process.stdout.write('What the correction looks like:\n');
  process.stdout.write(`${samples.join('\n')}\n\n`);
}

if (WRITE) {
  writeIncidents(kept);
  process.stdout.write(`Written. ${kept.length} rows.\n`);
} else {
  process.stdout.write('Nothing written. Pass --write to rewrite the ledger.\n');
}
