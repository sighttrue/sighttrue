import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  advisoryUrl,
  buildVerdict,
  cycleFor,
  findEntry,
  LIMITS,
  parsePkg,
  registryUrl,
  type EolProduct,
  type VerdictEntry,
} from '../src/lib/verdict.ts';
import { onRequestGet } from '../functions/api/verdict.ts';

/**
 * The endpoint an agent calls before accepting a dependency.
 *
 * Two properties are load-bearing and both are about restraint. Every reading
 * carries the address of the body that published it, because an agent quoting a
 * figure into a code review has to be citable. And nothing is scored, ranked or
 * totalled: an overall number would be this project's judgement of somebody
 * else's work dressed as a measurement, and the tests below refuse it directly.
 */

const TODAY = '2026-08-08';

function entry(over: Partial<VerdictEntry> = {}): VerdictEntry {
  return {
    repo: 'axios/axios',
    installs: 58_000_000,
    scorecard: 6.2,
    scoredAt: '2026-07-27',
    advisories: 12,
    license: 'MIT',
    archived: false,
    pushedAt: '2026-08-05T00:00:00Z',
    lastPublish: '2026-07-20',
    version: '1.7.4',
    withdrawn: null,
    installScripts: null,
    bytes: 209_281,
    funding: null,
    busFactor: 3,
    topShare: 0.42,
    ...over,
  };
}

const DJANGO: EolProduct[] = [
  { product: 'django', cycle: '5.1', eol: '2026-12-01', ended: false, latest: '5.1.4', lts: false },
  { product: 'django', cycle: '4.2', eol: '2026-04-01', ended: true, latest: '4.2.18', lts: true },
  { product: 'django', cycle: '4', eol: '2023-04-01', ended: true, latest: '4.0.10', lts: false },
];

function verdict(over: Partial<Parameters<typeof buildVerdict>[0]> = {}) {
  return buildVerdict({
    id: { registry: 'npm', name: 'axios' },
    found: { key: 'npm:axios', entry: entry() },
    cycles: [],
    version: null,
    asOf: '2026-08-08T13:15Z',
    today: TODAY,
    ...over,
  });
}

describe('reading the argument', () => {
  it('takes registry:name for the three registries', () => {
    expect(parsePkg('npm:axios')).toEqual({ registry: 'npm', name: 'axios' });
    expect(parsePkg('PyPI:Django')).toEqual({ registry: 'pypi', name: 'Django' });
    expect(parsePkg('crates:serde_json')).toEqual({ registry: 'crates', name: 'serde_json' });
    expect(parsePkg('npm:@scope/thing')).toEqual({ registry: 'npm', name: '@scope/thing' });
  });

  it('refuses anything else rather than guessing a registry', () => {
    expect(parsePkg(null)).toBeNull();
    expect(parsePkg('axios')).toBeNull();
    expect(parsePkg('maven:guava')).toBeNull();
    expect(parsePkg('npm:')).toBeNull();
    expect(parsePkg(':axios')).toBeNull();
  });

  it('refuses a name that is trying to be a path', () => {
    // The name is echoed back and built into URLs.
    expect(parsePkg('npm:../../etc/passwd')).toBeNull();
    expect(parsePkg('npm:/absolute')).toBeNull();
    expect(parsePkg(`npm:${'x'.repeat(300)}`)).toBeNull();
  });
});

describe('finding the package', () => {
  const packages = {
    'pypi:pyyaml': entry({ repo: 'yaml/pyyaml' }),
    'pypi:ruamel-yaml': entry({ repo: 'pycontribs/ruamel-yaml' }),
    'npm:axios': entry(),
  };

  it('matches however the caller spelled it', () => {
    // An agent reads whatever the requirements.txt says.
    expect(findEntry(packages, { registry: 'pypi', name: 'PyYAML' })?.key).toBe('pypi:pyyaml');
    // PEP 503 folds a run of dot, dash or underscore to one dash. It does not
    // remove separators, so `py_yaml` is a different package from `pyyaml`.
    expect(findEntry(packages, { registry: 'pypi', name: 'ruamel.yaml' })?.key).toBe(
      'pypi:ruamel-yaml',
    );
    expect(findEntry(packages, { registry: 'pypi', name: 'py_yaml' })).toBeNull();
    expect(findEntry(packages, { registry: 'npm', name: 'axios' })?.key).toBe('npm:axios');
  });

  it('does not match a name across registries', () => {
    expect(findEntry(packages, { registry: 'npm', name: 'pyyaml' })).toBeNull();
  });
});

describe('every reading carries its source', () => {
  it('cites each one to the body that published it', () => {
    const readings = verdict().readings as Record<string, { source: string; note: string }>;

    expect(readings['advisories']?.source).toBe(advisoryUrl('npm', 'axios'));
    expect(readings['published']?.source).toBe(registryUrl('npm', 'axios'));
    expect(readings['licence']?.source).toBe('https://github.com/axios/axios');
    expect(readings['busFactor']?.source).toContain('/graphs/contributors');
    expect(readings['scorecard']?.source).toContain('deps.dev');
    expect(readings['endOfLife']?.source).toContain('endoflife.date');
  });

  it('puts a note on every one of them', () => {
    // A number an agent pastes into a review without its limits is the failure
    // this project exists to avoid.
    for (const [name, reading] of Object.entries(verdict().readings)) {
      expect(typeof (reading as { note?: unknown }).note, `${name} has no note`).toBe('string');
    }
  });

  it('scores nothing and ranks nothing', () => {
    const body = JSON.stringify(verdict());

    expect(body).not.toMatch(/"(score|rating|grade|rank|risk|overall|verdict|recommendation)"/i);
    expect(body).not.toMatch(/\b(recommended|avoid|safe to use|do not use)\b/i);
  });

  it('says unread rather than zero when a source could not be read', () => {
    const readings = verdict({
      found: { key: 'npm:axios', entry: entry({ advisories: null }) },
    }).readings as Record<string, { value: unknown; note: string }>;

    expect(readings['advisories']?.value).toBeNull();
    expect(readings['advisories']?.note).toContain('unread, not zero');
  });

  it('counts the days since the last publish, from the date it holds', () => {
    const readings = verdict().readings as Record<string, { daysAgo: number }>;
    expect(readings['published']?.daysAgo).toBe(19);
  });
});

describe('a package nobody here tracks', () => {
  it('says so, and does not answer as if it had readings', () => {
    const result = verdict({ found: null });

    expect(result.covered).toBe(false);
    expect(result.page).toBeNull();
    expect(JSON.stringify(result.readings)).toContain('not a judgement');
    // Not an empty object: an agent handed `{}` reports "no advisories found".
    expect(result.readings['advisories']).toBeUndefined();
    expect(result.limits).toEqual(LIMITS);
  });
});

describe('end of life', () => {
  it('answers for the cycle the version is on, longest match first', () => {
    expect(cycleFor(DJANGO, '4.2.18')?.cycle).toBe('4.2');
    expect(cycleFor(DJANGO, '4.0.1')?.cycle).toBe('4');
    expect(cycleFor(DJANGO, '5.1')?.cycle).toBe('5.1');
  });

  it('reads a range the way a manifest writes one', () => {
    expect(cycleFor(DJANGO, '^4.2.0')?.cycle).toBe('4.2');
    expect(cycleFor(DJANGO, 'v5.1.2')?.cycle).toBe('5.1');
  });

  it('picks no cycle when no version was given', () => {
    // Guessing which release somebody is on is the one way this reading becomes
    // actively misleading.
    expect(cycleFor(DJANGO, null)).toBeNull();
    expect(cycleFor(DJANGO, '')).toBeNull();
  });

  it('returns the date and the product’s own page when a version is given', () => {
    const readings = verdict({
      id: { registry: 'pypi', name: 'django' },
      found: { key: 'pypi:django', entry: entry({ repo: 'django/django' }) },
      cycles: DJANGO,
      version: '4.2.18',
    }).readings as Record<string, { value: unknown; cycle: string; ended: boolean; source: string }>;

    expect(readings['endOfLife']?.value).toBe('2026-04-01');
    expect(readings['endOfLife']?.cycle).toBe('4.2');
    expect(readings['endOfLife']?.ended).toBe(true);
    expect(readings['endOfLife']?.source).toBe('https://endoflife.date/django');
  });

  it('lists every cycle when the caller gave no version', () => {
    const reading = (
      verdict({
        id: { registry: 'pypi', name: 'django' },
        found: { key: 'pypi:django', entry: entry({ repo: 'django/django' }) },
        cycles: DJANGO,
      }).readings as Record<string, { value: unknown; cycles: unknown[] }>
    )['endOfLife'];

    expect(reading?.value).toBeNull();
    expect(reading?.cycles).toHaveLength(3);
  });

  it('states the absence rather than omitting it', () => {
    // An absent field reads as "no end-of-life", which is a claim.
    const reading = (verdict().readings as Record<string, { value: unknown; note: string }>)[
      'endOfLife'
    ];

    expect(reading?.value).toBeNull();
    expect(reading?.note).toContain('not the same as being supported');
  });
});

// ------------------------------------------------------------- the endpoint

function bundles(packages: Record<string, VerdictEntry>) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input.toString();
    const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

    if (url.endsWith('/data/stack-index.json')) return reply({ packages });
    if (url.endsWith('/data/eol.json')) return reply({ products: DJANGO });
    if (url.endsWith('/data/meta.json')) return reply({ lastSuccessfulRunAt: '2026-08-08T13:15Z' });
    return new Response('not found', { status: 404 });
  });
}

async function get(query: string, packages: Record<string, VerdictEntry> = { 'npm:axios': entry() }) {
  vi.stubGlobal('fetch', bundles(packages));
  return onRequestGet({ request: new Request(`https://sighttrue.com/api/verdict${query}`) });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the endpoint', () => {
  it('answers one package in one call', async () => {
    const response = await get('?pkg=npm:axios');
    const body = (await response.json()) as { covered: boolean; page: string; readings: object };

    expect(response.status).toBe(200);
    expect(body.covered).toBe(true);
    expect(body.page).toBe('/npm/axios');
    expect(Object.keys(body.readings).sort()).toEqual([
      'advisories',
      'busFactor',
      'endOfLife',
      'funding',
      'installScripts',
      'installWeight',
      'licence',
      'published',
      'repository',
      'scorecard',
      'withdrawn',
    ]);
  });

  it('leads with the publisher’s own instruction not to install it', async () => {
    const response = await get('?pkg=npm:axios', {
      'npm:axios': entry({ withdrawn: 'no longer maintained, use fetch' }),
    });
    const body = (await response.json()) as {
      readings: { withdrawn: { value: string; note: string; source: string } };
    };

    expect(body.readings.withdrawn.value).toBe('no longer maintained, use fetch');
    expect(body.readings.withdrawn.note).toContain('republished unchanged');
    expect(body.readings.withdrawn.source).toContain('npmjs.com');
  });

  it('names install-time scripts without calling them dangerous', async () => {
    const response = await get('?pkg=npm:axios', {
      'npm:axios': entry({ installScripts: 'postinstall' }),
    });
    const body = (await response.json()) as {
      readings: { installScripts: { value: string; note: string } };
    };

    expect(body.readings.installScripts.value).toBe('postinstall');
    expect(body.readings.installScripts.note).toContain('not a claim that any of them is malicious');
  });

  it('narrows end of life when a version is given', async () => {
    const response = await get('?pkg=pypi:django&version=4.2.18', {
      'pypi:django': entry({ repo: 'django/django' }),
    });
    const body = (await response.json()) as {
      readings: { endOfLife: { cycle: string; value: string } };
    };

    expect(body.readings.endOfLife.cycle).toBe('4.2');
    expect(body.readings.endOfLife.value).toBe('2026-04-01');
  });

  it('says what it wanted when the argument is wrong', async () => {
    const response = await get('?pkg=maven:guava');

    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain('registry:name');
  });

  it('is readable from a browser, and cacheable for ten minutes', async () => {
    const response = await get('?pkg=npm:axios');

    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(response.headers.get('cache-control')).toContain('max-age=600');
  });

  it('reports a package it does not track without judging it', async () => {
    const response = await get('?pkg=npm:something-else');
    const body = (await response.json()) as { covered: boolean; readings: { note: string } };

    expect(response.status).toBe(200);
    expect(body.covered).toBe(false);
    expect(body.readings.note).toContain('not a judgement');
  });
});
