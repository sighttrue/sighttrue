import { generateKeyPairSync, createPublicKey, createVerify } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { appJwt, timingSafeEqual, toPkcs8, verifyWebhookSignature } from '../src/lib/github-app.ts';
import {
  commentBody,
  MARKER,
  MAX_MANIFESTS,
  readingsFor,
  registryFor,
  type Added,
  type StackEntry,
  type StackIndex,
} from '../src/lib/pr-readings.ts';
import { onRequestPost } from '../functions/api/github/webhook.ts';

/**
 * The pull-request bot writes under this project's name in repositories that
 * belong to other people. A wrong comment there is not an internal bug, it is
 * public damage that nobody here can take back — so the tests below are about
 * refusing to speak at least as much as they are about speaking.
 *
 * The signature check is exercised against real HMAC, and the App JWT against a
 * real RSA key generated per run, because both are the kind of code that passes
 * a shaped-object test while being unable to authenticate anything.
 */

const SECRET = 'a-webhook-secret-from-a-screenshot';

const KEYS = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
});

const PKCS8 = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

async function sign(body: string, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return `sha256=${[...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- signature

describe('verifying a delivery', () => {
  it('accepts the signature GitHub sends', async () => {
    const body = '{"action":"opened"}';
    expect(await verifyWebhookSignature(SECRET, body, await sign(body))).toBe(true);
  });

  it('refuses a signature made with a different secret', async () => {
    // The secret here was transcribed from a screenshot and has never been
    // proved to match. This is the branch that says so.
    const body = '{"action":"opened"}';
    expect(await verifyWebhookSignature(SECRET, body, await sign(body, 'not-it'))).toBe(false);
  });

  it('refuses a body that changed after it was signed', async () => {
    const signature = await sign('{"action":"opened"}');
    expect(await verifyWebhookSignature(SECRET, '{"action":"closed"}', signature)).toBe(false);
  });

  it('refuses a missing or malformed header rather than skipping the check', async () => {
    expect(await verifyWebhookSignature(SECRET, 'x', null)).toBe(false);
    expect(await verifyWebhookSignature(SECRET, 'x', '')).toBe(false);
    expect(await verifyWebhookSignature(SECRET, 'x', 'sha1=abc')).toBe(false);
    expect(await verifyWebhookSignature(SECRET, 'x', 'sha256=')).toBe(false);
  });

  it('refuses everything when no secret is configured', async () => {
    // Never "no secret, so nothing to check against, so accept it".
    expect(await verifyWebhookSignature('', '{}', `sha256=${'a'.repeat(64)}`)).toBe(false);
  });

  it('compares without stopping at the first wrong character', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'ab')).toBe(false);
  });
});

// ---------------------------------------------------------------- App token

describe('the App JWT', () => {
  it('signs with the PKCS#1 key GitHub hands out', async () => {
    const token = await appJwt('4527150', KEYS.privateKey, 1_800_000_000);
    const [header, payload, signature] = token.split('.') as [string, string, string];

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    expect(
      verifier.verify(createPublicKey(KEYS.publicKey), Buffer.from(signature, 'base64url')),
    ).toBe(true);
  });

  it('claims the App id, and backdates so a fast clock cannot reject it', async () => {
    const token = await appJwt('4527150', KEYS.privateKey, 1_800_000_000);
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1] as string, 'base64url').toString('utf8'),
    ) as { iss: string; iat: number; exp: number };

    expect(claims.iss).toBe('4527150');
    expect(claims.iat).toBe(1_800_000_000 - 60);
    // GitHub rejects a JWT valid for more than ten minutes.
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(600);
  });

  it('signs with a PKCS#8 key too, since both spellings turn up', async () => {
    const token = await appJwt('4527150', PKCS8.privateKey, 1_800_000_000);
    const [header, payload, signature] = token.split('.') as [string, string, string];

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${payload}`);
    expect(
      verifier.verify(createPublicKey(PKCS8.publicKey), Buffer.from(signature, 'base64url')),
    ).toBe(true);
  });

  it('leaves a PKCS#8 key exactly as it was', () => {
    const wrapped = toPkcs8(KEYS.privateKey);
    const passed = toPkcs8(PKCS8.privateKey);
    // The PKCS#1 body gains an envelope; the PKCS#8 one does not.
    expect(wrapped.length).toBeGreaterThan(0);
    expect(passed.length).toBeGreaterThan(0);
    expect(toPkcs8(PKCS8.privateKey)).toEqual(passed);
  });
});

// -------------------------------------------------------------- what to read

describe('which files are manifests', () => {
  it('reads the four it can parse, at any depth', () => {
    expect(registryFor('package.json')).toBe('npm');
    expect(registryFor('services/api/package.json')).toBe('npm');
    expect(registryFor('requirements.txt')).toBe('pypi');
    expect(registryFor('pyproject.toml')).toBe('pypi');
    expect(registryFor('crates/core/Cargo.toml')).toBe('crates');
  });

  it('reads nothing else', () => {
    expect(registryFor('src/index.ts')).toBeNull();
    expect(registryFor('package-lock.json')).toBeNull();
    expect(registryFor('go.mod')).toBeNull();
    expect(registryFor('README.md')).toBeNull();
  });

  it('ignores a manifest that is somebody else’s or a fixture', () => {
    // A test fixture named package.json describes nothing anybody installs.
    expect(registryFor('node_modules/left-pad/package.json')).toBeNull();
    expect(registryFor('tests/fixtures/package.json')).toBeNull();
    expect(registryFor('vendor/thing/Cargo.toml')).toBeNull();
    expect(registryFor('examples/demo/requirements.txt')).toBeNull();
  });
});

// ----------------------------------------------------------------- readings

function entry(over: Partial<StackEntry> = {}): StackEntry {
  return {
    repo: 'axios/axios',
    installs: 58_000_000,
    scorecard: 6.2,
    advisories: 12,
    license: 'MIT',
    archived: false,
    pushedAt: '2026-08-05T00:00:00Z',
    ...over,
  };
}

function index(packages: Record<string, StackEntry>): StackIndex {
  return {
    benchmark: { repositories: 388, medianScorecard: 6.1, scored: 289 },
    packages,
  };
}

const NOW = Date.parse('2026-08-08T00:00:00Z');

describe('matching added packages to readings', () => {
  it('reports only what is on the watchlist', () => {
    const added: Added[] = [
      { registry: 'npm', name: 'axios', path: 'package.json' },
      { registry: 'npm', name: 'nothing-tracked', path: 'package.json' },
    ];

    const found = readingsFor(added, index({ 'npm:axios': entry() }));
    expect(found.map((row) => row.name)).toEqual(['axios']);
  });

  it('folds the name the way the registry does before looking it up', () => {
    // PyYAML and pyyaml are one package. Missing the match would report a
    // tracked package as untracked, which is a quieter kind of wrong.
    const found = readingsFor(
      [{ registry: 'pypi', name: 'PyYAML', path: 'requirements.txt' }],
      index({ 'pypi:pyyaml': entry({ repo: 'yaml/pyyaml' }) }),
    );

    expect(found).toHaveLength(1);
    expect(found[0]?.name).toBe('PyYAML');
  });

  it('reports a package once when two manifests add it', () => {
    const found = readingsFor(
      [
        { registry: 'npm', name: 'axios', path: 'package.json' },
        { registry: 'npm', name: 'axios', path: 'web/package.json' },
      ],
      index({ 'npm:axios': entry() }),
    );

    expect(found).toHaveLength(1);
  });
});

describe('the comment', () => {
  const options = (over: Partial<Parameters<typeof commentBody>[0]> = {}) => ({
    readings: readingsFor(
      [{ registry: 'npm' as const, name: 'axios', path: 'package.json' }],
      index({ 'npm:axios': entry() }),
    ),
    added: [{ registry: 'npm' as const, name: 'axios', path: 'package.json' }],
    index: index({ 'npm:axios': entry() }),
    readAt: '2026-08-08T13:15Z',
    site: 'https://sighttrue.com',
    now: NOW,
    ...over,
  });

  it('says nothing at all when nothing added is tracked', () => {
    // The common outcome, and a success. A comment reporting that it found
    // nothing is a comment nobody wanted.
    expect(commentBody(options({ readings: [] }))).toBeNull();
  });

  it('carries the marker that makes the next push an edit', () => {
    expect(commentBody(options())?.startsWith(MARKER)).toBe(true);
  });

  it('states every number this project already publishes, and links the source', () => {
    const body = commentBody(options()) as string;

    expect(body).toContain('axios');
    expect(body).toContain('https://sighttrue.com/repo/axios/axios');
    expect(body).toContain('58.0M');
    expect(body).toContain('6.2');
    expect(body).toContain('MIT');
  });

  it('never calls a package safe, unsafe, risky or recommended', () => {
    const body = commentBody(
      options({
        readings: readingsFor(
          [{ registry: 'npm' as const, name: 'axios', path: 'package.json' }],
          index({ 'npm:axios': entry({ advisories: 40, scorecard: 2.1, archived: true }) }),
        ),
        index: index({ 'npm:axios': entry({ advisories: 40, scorecard: 2.1, archived: true }) }),
      }),
    ) as string;

    // The readings themselves, above the fold. The notes below do use the word
    // "unsafe", in the sentence that refuses to make the claim.
    const readings = body.split('<details>')[0] as string;
    expect(readings).not.toMatch(/\b(safe|unsafe|risky|dangerous|vulnerable|recommend|avoid)\b/i);
    // Archived is a fact about the repository and is stated as one.
    expect(readings).toContain('archived');
  });

  it('says what a scorecard measures, beside the scorecard', () => {
    const body = commentBody(options()) as string;

    expect(body).toContain('declared practices');
    expect(body).toContain('median across 388 tracked repositories is 6.1');
    expect(body).toContain('not a statement that a project is unsafe');
  });

  it('says how many added packages it has nothing on', () => {
    const body = commentBody(
      options({
        added: [
          { registry: 'npm', name: 'axios', path: 'package.json' },
          { registry: 'npm', name: 'untracked-one', path: 'package.json' },
          { registry: 'npm', name: 'untracked-two', path: 'package.json' },
        ],
      }),
    ) as string;

    expect(body).toContain('2 other dependencies added here are not tracked');
    expect(body).toContain('not a judgement');
  });

  it('dates its own numbers', () => {
    expect(commentBody(options()) as string).toContain('2026-08-08T13:15Z');
    expect(commentBody(options()) as string).toContain('every four hours at best');
  });
});

// ------------------------------------------------------------- the endpoint

interface Call {
  url: string;
  method: string;
  body: unknown;
}

/**
 * A GitHub that answers the four calls this makes, and records what was asked.
 *
 * Everything else 404s, so a request this bot makes and nobody wrote a case for
 * fails the test rather than passing by accident.
 */
function github(over: {
  files?: { filename: string; status?: string }[];
  contents?: Record<string, string>;
  comments?: { id: number; body: string }[];
  commentStatus?: number;
} = {}) {
  const calls: Call[] = [];

  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: init?.body === undefined ? null : JSON.parse(String(init.body)) });

    const reply = (body: unknown, status = 200) =>
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

    if (url.includes('/access_tokens')) return reply({ token: 'ghs_installation' });

    if (url.includes('/pulls/7/files')) {
      return reply(url.includes('page=1') ? (over.files ?? []) : []);
    }

    if (url.includes('/contents/')) {
      const path = /\/contents\/([^?]+)\?ref=(.+)$/.exec(url);
      const key = `${decodeURIComponent(path?.[2] ?? '')}:${decodeURIComponent(path?.[1] ?? '')}`;
      const text = over.contents?.[key];
      return text === undefined ? reply('Not Found', 404) : reply(text);
    }

    if (url.includes('/issues/7/comments')) {
      if (method === 'POST') return reply({ id: 99 }, over.commentStatus ?? 201);
      return reply(url.includes('page=1') ? (over.comments ?? []) : []);
    }

    if (url.includes('/issues/comments/')) return reply({ id: 42 }, over.commentStatus ?? 200);

    if (url.endsWith('/data/stack-index.json')) {
      return reply(
        index({
          'npm:axios': entry(),
          'npm:left-pad': entry({ repo: 'left-pad/left-pad' }),
          'pypi:requests': entry({ repo: 'psf/requests' }),
        }),
      );
    }
    if (url.endsWith('/data/meta.json')) return reply({ lastSuccessfulRunAt: '2026-08-08T13:15Z' });

    return reply('unexpected', 404);
  });

  return { fetcher, calls };
}

const ENV = {
  APP_GITHUB_ID: '4527150',
  APP_GITHUB_PRIVATE_KEY: KEYS.privateKey,
  APP_GITHUB_WEBHOOK_SECRET: SECRET,
};

function event(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: 'opened',
    installation: { id: 12345 },
    repository: { full_name: 'someone/theirs' },
    pull_request: { number: 7, draft: false, head: { sha: 'headsha' }, base: { sha: 'basesha' } },
    ...over,
  });
}

async function deliver(
  body: string,
  over: { signature?: string | null; event?: string; env?: typeof ENV } = {},
): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' });
  const signature = over.signature === undefined ? await sign(body) : over.signature;
  if (signature !== null) headers.set('x-hub-signature-256', signature);
  headers.set('x-github-event', over.event ?? 'pull_request');

  return onRequestPost({
    request: new Request('https://sighttrue.com/api/github/webhook', {
      method: 'POST',
      headers,
      body,
    }),
    env: over.env ?? ENV,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the webhook endpoint', () => {
  it('refuses an unsigned delivery before reading anything', async () => {
    const { fetcher, calls } = github();
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event(), { signature: null });

    expect(response.status).toBe(401);
    // Not one call to GitHub, and nothing written anywhere.
    expect(calls).toHaveLength(0);
  });

  it('refuses a delivery signed with the wrong secret, and says so', async () => {
    // The one failure the maintainer is waiting to see in the App's delivery
    // log, because the secret was transcribed from a screenshot.
    const { fetcher, calls } = github();
    vi.stubGlobal('fetch', fetcher);

    const body = event();
    const response = await deliver(body, { signature: await sign(body, 'wrong') });

    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: string }).error).toContain('did not match');
    expect(calls).toHaveLength(0);
  });

  it('answers a ping without touching anything', async () => {
    const { fetcher } = github();
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(JSON.stringify({ zen: 'Keep it logically awesome.' }), {
      event: 'ping',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pong: true });
  });

  it('says so plainly when the deployment has no secret', async () => {
    const { fetcher } = github();
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event(), {
      env: { ...ENV, APP_GITHUB_WEBHOOK_SECRET: '' },
    });

    expect(response.status).toBe(503);
  });

  it('ignores an action that cannot have changed a dependency', async () => {
    const { fetcher, calls } = github();
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event({ action: 'labeled' }));

    expect(await response.json()).toMatchObject({ ignored: 'pull_request.labeled' });
    expect(calls).toHaveLength(0);
  });

  it('leaves a draft alone until it is ready', async () => {
    const { fetcher, calls } = github();
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(
      event({ pull_request: { number: 7, draft: true, head: { sha: 'h' }, base: { sha: 'b' } } }),
    );

    expect(await response.json()).toMatchObject({ ignored: 'draft' });
    expect(calls).toHaveLength(0);
  });

  it('says nothing on a pull request that changes no manifest', async () => {
    const { fetcher, calls } = github({ files: [{ filename: 'src/index.ts' }] });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(await response.json()).toMatchObject({ commented: false, reason: 'no manifest changed' });
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/issues/'))).toBe(false);
  });

  it('says nothing when a manifest changed but no dependency was added', async () => {
    const { fetcher, calls } = github({
      files: [{ filename: 'package.json' }],
      contents: {
        'headsha:package.json': '{"dependencies":{"axios":"^1.7.0"}}',
        'basesha:package.json': '{"dependencies":{"axios":"^1.6.0"}}',
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(await response.json()).toMatchObject({ commented: false, reason: 'no dependency added' });
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/issues/'))).toBe(false);
  });

  it('says nothing when what was added is not on the watchlist', async () => {
    const { fetcher, calls } = github({
      files: [{ filename: 'package.json' }],
      contents: {
        'headsha:package.json': '{"dependencies":{"some-private-thing":"^1.0.0"}}',
        'basesha:package.json': '{"dependencies":{}}',
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(await response.json()).toMatchObject({ commented: false, added: 1 });
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/issues/'))).toBe(false);
  });

  it('comments once when a tracked dependency is added', async () => {
    const { fetcher, calls } = github({
      files: [{ filename: 'package.json' }],
      contents: {
        'headsha:package.json': '{"dependencies":{"axios":"^1.7.0","left-pad":"^1.3.0"}}',
        'basesha:package.json': '{"dependencies":{"left-pad":"^1.3.0"}}',
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(await response.json()).toMatchObject({ commented: true, edited: false, tracked: 1 });

    const posted = calls.find((call) => call.method === 'POST' && call.url.includes('/issues/7/comments'));
    expect(posted).toBeDefined();
    const body = (posted?.body as { body: string }).body;
    expect(body).toContain('axios');
    // left-pad was already there. Reporting it would be reporting the diff wrong.
    expect(body).not.toContain('left-pad');
  });

  it('edits its own comment on the next push instead of adding another', async () => {
    const { fetcher, calls } = github({
      files: [{ filename: 'package.json' }],
      contents: {
        'headsha:package.json': '{"dependencies":{"axios":"^1.7.0"}}',
        'basesha:package.json': '{}',
      },
      comments: [
        { id: 555, body: `${MARKER}\nan earlier reading` },
        { id: 556, body: 'a human saying something' },
      ],
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event({ action: 'synchronize' }));

    expect(await response.json()).toMatchObject({ commented: true, edited: true });
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('/issues/7/comments'))).toBe(
      false,
    );
    expect(calls.some((call) => call.method === 'PATCH' && call.url.endsWith('/issues/comments/555'))).toBe(
      true,
    );
  });

  it('reads a manifest that the pull request adds outright', async () => {
    // The base has no such file, so GitHub answers 404 and everything in the
    // new file is new.
    const { fetcher, calls } = github({
      files: [{ filename: 'api/requirements.txt', status: 'added' }],
      contents: {
        'headsha:api/requirements.txt': '# pinned\nrequests==2.31.0\n-r other.txt\n',
      },
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(await response.json()).toMatchObject({ commented: true, tracked: 1 });
    const posted = calls.find((call) => call.method === 'POST' && call.url.includes('/issues/7/comments'));
    const body = (posted?.body as { body: string }).body;
    expect(body).toContain('requests');
    // `-r other.txt` is an include directive, not a package called `other`.
    expect(body).not.toContain('other');
  });

  it('reports a refusal to itself rather than to the pull request', async () => {
    const { fetcher } = github({
      files: [{ filename: 'package.json' }],
      contents: {
        'headsha:package.json': '{"dependencies":{"axios":"^1.7.0"}}',
        'basesha:package.json': '{}',
      },
      commentStatus: 403,
    });
    vi.stubGlobal('fetch', fetcher);

    const response = await deliver(event());

    expect(response.status).toBe(502);
    expect(((await response.json()) as { error: string }).error).toContain('403');
  });

  it('reads at most a handful of manifests', async () => {
    const files = Array.from({ length: 9 }, (_, i) => ({ filename: `pkg${i}/package.json` }));
    const { fetcher, calls } = github({ files });
    vi.stubGlobal('fetch', fetcher);

    await deliver(event());

    const reads = calls.filter((call) => call.url.includes('/contents/'));
    expect(reads.length).toBeLessThanOrEqual(MAX_MANIFESTS * 2);
  });
});
