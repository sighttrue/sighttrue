/**
 * The pull-request bot.
 *
 * A dependency is accepted in a code review, in about four seconds, by somebody
 * who has no reading of it and no time to go and get one. This puts the reading
 * where that decision is made — one comment, on pull requests that add a
 * dependency this project already tracks, saying what it has on record and
 * nothing else.
 *
 * It writes under this project's name in repositories that belong to other
 * people, which sets the bar for every decision in this file:
 *
 *   - Nothing runs before the signature is verified against the App's webhook
 *     secret. An unverified delivery is a stranger asking this App to comment.
 *   - The comment is edited, never repeated. One row per pull request, however
 *     many times the branch is pushed.
 *   - Silence is the default. No manifest changed, no dependency added, nothing
 *     added that is on the watchlist — each of those is a 200 and no comment.
 *     A bot that announces it found nothing is a bot people uninstall.
 *   - Every failure after the signature check is reported in this response, not
 *     in the pull request. The delivery log is where a broken deployment should
 *     be visible; a stranger's code review is not.
 *
 * The webhook secret was transcribed from a screenshot and has never been
 * proved to match. The first real delivery proves it: a mismatch answers 401
 * with that reason in the body, which is what the App's Advanced tab shows.
 */

import { diffDependencies, parseManifest } from '../../../src/lib/manifests.ts';
import { appJwt, verifyWebhookSignature } from '../../../src/lib/github-app.ts';
import {
  commentBody,
  manifestName,
  MARKER,
  MAX_MANIFESTS,
  readingsFor,
  registryFor,
  type Added,
  type StackIndex,
} from '../../../src/lib/pr-readings.ts';

export interface Env {
  APP_GITHUB_ID?: string;
  APP_GITHUB_PRIVATE_KEY?: string;
  APP_GITHUB_WEBHOOK_SECRET?: string;
}

const API = 'https://api.github.com';
const USER_AGENT = 'sighttrue-bot (+https://sighttrue.com)';

/** Actions that can change what a branch depends on. */
const ACTIONS = new Set(['opened', 'synchronize', 'reopened', 'ready_for_review']);

/** Pages of changed files to read. A pull request touching 300 files is rare. */
const FILE_PAGES = 3;

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

function headers(token: string, accept = 'application/vnd.github+json'): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept,
    'user-agent': USER_AGENT,
    'x-github-api-version': '2022-11-28',
  };
}

interface PullRequestEvent {
  action?: string;
  number?: number;
  installation?: { id?: number };
  repository?: { full_name?: string; owner?: { login?: string }; name?: string };
  pull_request?: {
    number?: number;
    draft?: boolean;
    head?: { sha?: string };
    base?: { sha?: string };
  };
}

/**
 * An installation token, which is what actually reads the branch and writes the
 * comment. The App JWT can do neither — it only proves which App is asking.
 */
async function installationToken(env: Env, installationId: number): Promise<string | null> {
  const appId = env.APP_GITHUB_ID ?? '';
  const key = env.APP_GITHUB_PRIVATE_KEY ?? '';
  if (appId === '' || key === '') return null;

  let jwt: string;
  try {
    jwt = await appJwt(appId, key);
  } catch {
    // Never quotes the exception: it was raised while handling a private key.
    return null;
  }

  const response = await fetch(`${API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: headers(jwt),
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { token?: string };
  return typeof body.token === 'string' && body.token !== '' ? body.token : null;
}

/** The file as it is at one commit, or null when it is not there at all. */
async function fileAt(
  repo: string,
  path: string,
  ref: string,
  token: string,
): Promise<string | null> {
  const url = `${API}/repos/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`;
  const response = await fetch(url, { headers: headers(token, 'application/vnd.github.raw') });
  // 404 is the ordinary answer for a manifest this pull request adds. It means
  // everything in the new file is new, which is exactly what the diff says.
  if (!response.ok) return null;
  return response.text();
}

async function changedManifests(repo: string, number: number, token: string): Promise<string[]> {
  const paths: string[] = [];

  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const response = await fetch(
      `${API}/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`,
      { headers: headers(token) },
    );
    if (!response.ok) break;

    const files = (await response.json()) as { filename?: string; status?: string }[];
    if (!Array.isArray(files) || files.length === 0) break;

    for (const file of files) {
      const filename = file.filename;
      if (typeof filename !== 'string') continue;
      // A deleted manifest removes dependencies. This reports additions, and
      // reading a file that is gone would report every dependency in it.
      if (file.status === 'removed') continue;
      if (registryFor(filename) !== null) paths.push(filename);
    }

    if (files.length < 100) break;
  }

  return paths.slice(0, MAX_MANIFESTS);
}

/** The bot's own comment on this pull request, found by its marker. */
async function existingComment(
  repo: string,
  number: number,
  token: string,
): Promise<number | null> {
  for (let page = 1; page <= FILE_PAGES; page += 1) {
    const response = await fetch(
      `${API}/repos/${repo}/issues/${number}/comments?per_page=100&page=${page}`,
      { headers: headers(token) },
    );
    if (!response.ok) return null;

    const comments = (await response.json()) as { id?: number; body?: string }[];
    if (!Array.isArray(comments) || comments.length === 0) return null;

    for (const comment of comments) {
      if (typeof comment.body === 'string' && comment.body.includes(MARKER)) {
        return typeof comment.id === 'number' ? comment.id : null;
      }
    }

    if (comments.length < 100) return null;
  }

  return null;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;

  const secret = env.APP_GITHUB_WEBHOOK_SECRET ?? '';
  if (secret === '') {
    return json({ error: 'the webhook secret is not configured on this deployment' }, 503);
  }

  // Read as text, verify, and only then parse. The signature is over the bytes
  // GitHub sent; a re-serialised object is a different document.
  const raw = await request.text();
  const signed = await verifyWebhookSignature(
    secret,
    raw,
    request.headers.get('x-hub-signature-256'),
  );
  if (!signed) {
    return json(
      {
        error:
          'the signature did not match the configured secret; nothing was read and nothing was written',
      },
      401,
    );
  }

  const event = request.headers.get('x-github-event');
  if (event === 'ping') return json({ ok: true, pong: true });
  if (event !== 'pull_request') return json({ ignored: event ?? 'unknown event' }, 202);

  let payload: PullRequestEvent;
  try {
    payload = JSON.parse(raw) as PullRequestEvent;
  } catch {
    return json({ error: 'the delivery body is not JSON' }, 400);
  }

  const action = payload.action ?? '';
  if (!ACTIONS.has(action)) return json({ ignored: `pull_request.${action}` });

  // A draft is somebody thinking out loud. `ready_for_review` arrives when they
  // stop, and that is when this has something worth saying.
  if (payload.pull_request?.draft === true && action !== 'ready_for_review') {
    return json({ ignored: 'draft' });
  }

  const repo = payload.repository?.full_name ?? '';
  const number = payload.pull_request?.number ?? payload.number ?? 0;
  const head = payload.pull_request?.head?.sha ?? '';
  const base = payload.pull_request?.base?.sha ?? '';
  const installation = payload.installation?.id ?? 0;

  if (repo === '' || number === 0 || head === '' || base === '' || installation === 0) {
    return json({ error: 'the delivery is missing the repository, pull request or installation' }, 400);
  }

  const token = await installationToken(env, installation);
  if (token === null) {
    return json({ error: 'could not mint an installation token for this App' }, 502);
  }

  const manifests = await changedManifests(repo, number, token);
  if (manifests.length === 0) return json({ commented: false, reason: 'no manifest changed' });

  // What the branch adds, per manifest: the file at both commits, read by the
  // same parser the collector uses, and the difference between them.
  const added: Added[] = [];
  for (const path of manifests) {
    const registry = registryFor(path);
    if (registry === null) continue;

    const name = manifestName(path);
    const [after, before] = await Promise.all([
      fileAt(repo, path, head, token),
      fileAt(repo, path, base, token),
    ]);
    if (after === null) continue;

    const diff = diffDependencies(
      before === null ? {} : parseManifest(name, before),
      parseManifest(name, after),
    );
    for (const dependency of diff.added) added.push({ registry, name: dependency, path });
  }

  if (added.length === 0) return json({ commented: false, reason: 'no dependency added' });

  const origin = new URL(request.url).origin;
  const index = await loadIndex(origin);
  if (index === null) return json({ error: 'the readings could not be loaded' }, 502);

  const readings = readingsFor(added, index);
  const body = commentBody({
    readings,
    added,
    index,
    readAt: await lastReadAt(origin),
    site: origin,
  });

  // Nothing tracked was added. This is the common outcome and it is a success.
  if (body === null) {
    return json({ commented: false, reason: 'nothing added is on the watchlist', added: added.length });
  }

  const existing = await existingComment(repo, number, token);

  const response = await fetch(
    existing === null
      ? `${API}/repos/${repo}/issues/${number}/comments`
      : `${API}/repos/${repo}/issues/comments/${existing}`,
    {
      method: existing === null ? 'POST' : 'PATCH',
      headers: { ...headers(token), 'content-type': 'application/json' },
      body: JSON.stringify({ body }),
    },
  );

  if (!response.ok) {
    return json(
      { error: `GitHub refused the comment with ${response.status}`, edited: existing !== null },
      502,
    );
  }

  return json({
    commented: true,
    edited: existing !== null,
    repository: repo,
    pullRequest: number,
    added: added.length,
    tracked: readings.length,
  });
}

async function loadIndex(origin: string): Promise<StackIndex | null> {
  try {
    const response = await fetch(`${origin}/data/stack-index.json`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;
    return (await response.json()) as StackIndex;
  } catch {
    return null;
  }
}

/** When the agent last ran, so the comment can date its own numbers. */
async function lastReadAt(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/data/meta.json`, {
      cf: { cacheTtl: 300, cacheEverything: true },
    } as RequestInit);
    if (!response.ok) return null;
    const meta = (await response.json()) as { lastSuccessfulRunAt?: unknown };
    return typeof meta.lastSuccessfulRunAt === 'string' ? meta.lastSuccessfulRunAt : null;
  } catch {
    return null;
  }
}
