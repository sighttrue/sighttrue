import { afterEach, describe, expect, it, vi } from 'vitest';

import { onRequestPost } from '../functions/api/mcp.ts';
import { PAGED_IDS, WATCHABLE_IDS } from '../src/lib/registries-table.ts';
import type { VerdictEntry } from '../src/lib/verdict.ts';

/**
 * The Model Context Protocol server, which had no tests at all.
 *
 * It is the surface most likely to be read by something that cannot push back.
 * A person seeing a broken link on a page clicks it and shrugs; an agent handed
 * a `page` field quotes it into a code review, and a reviewer reads a URL that
 * has never existed under this project's name. So the assertions here are about
 * what it hands out rather than about how it is written.
 */

function entry(over: Partial<VerdictEntry> = {}): VerdictEntry {
  return {
    repo: 'a/one',
    installs: 1_000,
    scorecard: 6.2,
    scoredAt: '2026-07-27',
    advisories: 0,
    license: 'MIT',
    archived: false,
    pushedAt: '2026-08-05T00:00:00Z',
    lastPublish: '2026-07-20',
    version: '1.0.0',
    withdrawn: null,
    installScripts: null,
    bytes: 1_000,
    funding: null,
    busFactor: 3,
    topShare: 0.42,
    ...over,
  };
}

function bundles(packages: Record<string, VerdictEntry>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    if (url.endsWith('/data/stack-index.json')) return reply({ packages });
    if (url.endsWith('/data/eol.json')) return reply({ products: [] });
    if (url.endsWith('/data/meta.json')) return reply({ lastSuccessfulRunAt: '2026-08-08T13:15Z' });
    if (url.endsWith('/data/compare.json')) return reply({ rows: [] });
    if (url.endsWith('/data/index.json')) return reply({ watchlist: { active: 417 } });
    return new Response('not found', { status: 404 });
  });
}

async function call(
  method: string,
  params: unknown = {},
  packages: Record<string, VerdictEntry> = { 'npm:axios': entry() },
) {
  vi.stubGlobal('fetch', bundles(packages));
  const response = await onRequestPost({
    request: new Request('https://sighttrue.com/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  });
  return { response, body: (await response.json()) as Record<string, never> };
}

/** The tool payload, which the protocol wraps in a text block. */
async function tool(name: string, args: unknown, packages?: Record<string, VerdictEntry>) {
  const { body } = await call('tools/call', { name, arguments: args }, packages);
  const text = (body as unknown as { result: { content: { text: string }[] } }).result.content[0]
    ?.text;
  return JSON.parse(text ?? '{}') as Record<string, unknown>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the protocol itself', () => {
  it('answers initialize with a version it implements', async () => {
    const { body } = await call('initialize', { protocolVersion: '2025-06-18' });
    const result = (body as unknown as { result: { protocolVersion: string } }).result;

    expect(result.protocolVersion).toBe('2025-06-18');
  });

  it('falls back to its newest version rather than echoing an unknown one', async () => {
    const { body } = await call('initialize', { protocolVersion: 'not-a-version' });
    const result = (body as unknown as { result: { protocolVersion: string } }).result;

    expect(result.protocolVersion).toBe('2025-06-18');
  });

  it('refuses a batch in words instead of crashing on an array', async () => {
    vi.stubGlobal('fetch', bundles({}));
    const response = await onRequestPost({
      request: new Request('https://sighttrue.com/api/mcp', {
        method: 'POST',
        body: JSON.stringify([{ jsonrpc: '2.0', id: 1, method: 'ping' }]),
      }),
    });
    const body = (await response.json()) as { error: { code: number; message: string } };

    expect(body.error.code).toBe(-32600);
    expect(body.error.message).toContain('Batched');
  });

  it('never throws to the runtime, because a 500 reads as a broken tool', async () => {
    vi.stubGlobal('fetch', bundles({}));
    const response = await onRequestPost({
      request: new Request('https://sighttrue.com/api/mcp', { method: 'POST', body: 'not json' }),
    });
    const body = (await response.json()) as { error: { code: number } };

    expect(response.status).toBe(200);
    expect(body.error.code).toBe(-32700);
  });
});

describe('what the tools accept', () => {
  it('offers every registry the rest of the project collects', async () => {
    // This named three for a week after four more were opened, so an agent
    // reading the schema would have concluded gem:rails could not be asked
    // about — while five collectors held readings on it.
    const { body } = await call('tools/list');
    const tools = (body as unknown as { result: { tools: { inputSchema: { properties: { registry?: { enum?: string[] } } } }[] } })
      .result.tools;

    for (const declared of tools) {
      const offered = declared.inputSchema.properties.registry?.enum;
      if (offered === undefined) continue;
      expect([...offered].sort()).toEqual([...WATCHABLE_IDS].sort());
    }
  });

  it('names the registries it wants when handed one it does not know', async () => {
    const payload = await tool('check_before_install', { registry: 'hex', name: 'phoenix' });

    expect(String(payload['error'])).toContain('gem');
    expect(String(payload['error'])).toContain('packagist');
  });
});

describe('the page an agent is handed', () => {
  it('links a package page for every registry that has one', async () => {
    for (const [pkg, page] of [
      ['gem:rails', 'https://sighttrue.com/gem/rails'],
      ['packagist:acme/widget', 'https://sighttrue.com/packagist/acme/widget'],
      ['nuget:Serilog', 'https://sighttrue.com/nuget/Serilog'],
    ] as const) {
      const cut = pkg.indexOf(':');
      const payload = await tool(
        'check_before_install',
        { registry: pkg.slice(0, cut), name: pkg.slice(cut + 1) },
        { [pkg]: entry() },
      );

      expect(payload['page']).toBe(page);
    }
  });

  it('offers no page for Maven, whose names are not addresses', async () => {
    // `group:artifact` is not a URL segment, so the build publishes no page.
    // Handing one back would put a URL that has never existed into whatever the
    // agent writes next.
    const payload = await tool(
      'check_before_install',
      { registry: 'maven', name: 'com.acme:widget' },
      { 'maven:com.acme:widget': entry() },
    );

    expect(payload['covered']).toBe(true);
    expect(payload['page']).toBeNull();
    expect(PAGED_IDS).not.toContain('maven');
  });
});

describe('what it refuses to say', () => {
  it('reports an untracked package without judging it', async () => {
    const payload = await tool('check_before_install', { registry: 'npm', name: 'unknown-thing' });

    expect(payload['covered']).toBe(false);
    expect(String(payload['note'])).toContain('not a judgement');
  });

  it('never returns a field an agent would read as a verdict', async () => {
    const payload = await tool('check_before_install', { registry: 'npm', name: 'axios' });
    const serialised = JSON.stringify(payload).toLowerCase();

    for (const key of ['"safe"', '"risky"', '"score"', '"rank"', '"recommendation"', '"verdict"']) {
      expect(serialised).not.toContain(key);
    }
  });

  it('says an empty result means nothing was found, not that nothing is wrong', async () => {
    const payload = await tool('check_before_install', { registry: 'npm', name: 'axios' });

    expect(payload['notices']).toEqual([]);
    expect(String(payload['note'])).toContain('not a statement that it is safe');
  });
});
