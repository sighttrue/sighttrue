/**
 * One call, every reading, each one cited.
 *
 *   GET /api/verdict?pkg=npm:axios
 *   GET /api/verdict?pkg=pypi:django&version=4.2
 *
 * Built for agents rather than for browsers. An agent deciding whether to
 * accept a dependency has five questions — advisories, licence, when it last
 * shipped, who writes it, whether the release is still supported — spread
 * across four services, so in practice it asks none of them and answers from
 * training data instead.
 *
 * The name is a concession to what people search for and it is a poor
 * description of what this returns: there is no verdict in it. No score, no
 * rank, no total, and no recommendation — those would be this project's
 * judgement of somebody else's work wearing the costume of a measurement. What
 * every reading carries instead is a `source`, so a figure quoted into a code
 * review can be checked in one click by the person reading it.
 *
 * Reads published files from its own origin and nothing else. No key, no
 * account, no database, no quota to drain — the worst an abusive client can do
 * is fetch bundles that are already public at their own URLs.
 */

import {
  buildVerdict,
  findEntry,
  parsePkg,
  type EolProduct,
  type VerdictEntry,
} from '../../src/lib/verdict.ts';

interface StackIndex {
  packages: Record<string, VerdictEntry>;
}

interface EolBundle {
  products: EolProduct[];
}

interface MetaBundle {
  lastSuccessfulRunAt?: unknown;
}

const HEADERS = {
  'content-type': 'application/json',
  // Public data, and agents run in browsers as often as not.
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  // Ten minutes. Long enough to absorb a burst, short enough that a four-hourly
  // run is visible well inside the hour.
  'cache-control': 'public, max-age=600',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: HEADERS });
}

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

export function onRequestOptions(): Response {
  return new Response(null, { status: 204, headers: HEADERS });
}

export async function onRequestGet(context: { request: Request }): Promise<Response> {
  const url = new URL(context.request.url);
  const origin = url.origin;

  const id = parsePkg(url.searchParams.get('pkg'));
  if (id === null) {
    return json(
      {
        error:
          'pkg is required and must be registry:name, where registry is npm, pypi or crates. For example pkg=npm:axios.',
      },
      400,
    );
  }

  // A version is optional and only ever narrows the end-of-life answer. Bounded
  // because it is echoed back in a note.
  const raw = url.searchParams.get('version');
  const version = raw === null || raw.trim() === '' ? null : raw.trim().slice(0, 40);

  const [index, eol, meta] = await Promise.all([
    loadJson<StackIndex>(origin, '/data/stack-index.json'),
    loadJson<EolBundle>(origin, '/data/eol.json'),
    loadJson<MetaBundle>(origin, '/data/meta.json'),
  ]);

  if (index === null) {
    return json({ error: 'The readings could not be loaded.' }, 502);
  }

  // Matched by name, which is how a package and a supported product line up
  // when they line up at all: `pypi:django` against the `django` product.
  const wanted = id.name.toLowerCase();
  const cycles = (eol?.products ?? []).filter((row) => row.product.toLowerCase() === wanted);

  const asOf =
    typeof meta?.lastSuccessfulRunAt === 'string' ? meta.lastSuccessfulRunAt : null;

  return json(
    buildVerdict({
      id,
      found: findEntry(index.packages, id),
      cycles,
      version,
      asOf,
      today: new Date().toISOString().slice(0, 10),
    }),
  );
}
