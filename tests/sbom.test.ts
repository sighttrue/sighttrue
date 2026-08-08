import { describe, expect, it } from 'vitest';

import { SBOM_SCRIPT } from '../src/site/sbom-script.ts';
import { STACK_SCRIPT } from '../src/site/stack.ts';

/**
 * The bill of materials, tested by running the code that ships.
 *
 * `SBOM_SCRIPT` is JavaScript source embedded in the page rather than a module
 * this file can import, because the stack page has no build step and the
 * manifest must never leave the browser. Evaluating the string is what makes
 * the thing under test and the thing that runs the same object — the
 * alternative is a TypeScript copy that agrees with it until it does not.
 *
 * What matters here is what the document does not say. It is a compliance
 * artefact, produced for people who are required to have one, and the failure
 * mode is not a crash: it is a well-formed file asserting versions nobody
 * resolved and completeness nobody checked.
 */

const build = new Function(`${SBOM_SCRIPT}; return sighttrueSbom;`)() as (
  rows: unknown[],
  options?: Record<string, unknown>,
) => Record<string, never>;

interface Doc {
  bomFormat: string;
  specVersion: string;
  version: number;
  serialNumber?: string;
  metadata: {
    timestamp: string;
    tools: { components: { name: string }[] };
    properties: { name: string; value: string }[];
  };
  components: {
    type: string;
    name: string;
    version?: string;
    purl: string;
    licenses?: { license: { id: string } }[];
    externalReferences?: { type: string; url: string }[];
    properties: { name: string; value: string }[];
  }[];
}

function row(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    key: 'npm:axios',
    name: 'axios',
    range: '^1.6.0',
    tracked: true,
    repo: 'axios/axios',
    license: 'MIT',
    advisories: 12,
    scorecard: 6.2,
    pushedAt: '2026-08-05T00:00:00Z',
    lastPublish: '2026-07-20',
    archived: false,
    busFactor: 3,
    ...over,
  };
}

const OPTIONS = { origin: 'https://sighttrue.com', now: '2026-08-08T12:00:00.000Z' };

function doc(rows: Record<string, unknown>[], over: Record<string, unknown> = {}): Doc {
  return build(rows, { ...OPTIONS, ...over }) as unknown as Doc;
}

describe('the document', () => {
  it('is a CycloneDX 1.6 bill of materials', () => {
    const result = doc([row()]);

    expect(result.bomFormat).toBe('CycloneDX');
    expect(result.specVersion).toBe('1.6');
    expect(result.version).toBe(1);
    expect(result.metadata.timestamp).toBe('2026-08-08T12:00:00.000Z');
    expect(result.metadata.tools.components[0]?.name).toBe('Sighttrue');
  });

  it('carries a serial number when one was minted, and none when it was not', () => {
    expect(doc([row()], { serialNumber: 'urn:uuid:abc' }).serialNumber).toBe('urn:uuid:abc');
    expect(doc([row()]).serialNumber).toBeUndefined();
  });

  it('states no version, and says why in the document itself', () => {
    // The failure that matters. A manifest declares `^1.6.0`; it does not say
    // what was installed. A version here would be a compliance artefact
    // asserting something nobody resolved.
    const result = doc([row()]);

    expect(result.components[0]?.version).toBeUndefined();
    const said = result.metadata.properties.map((entry) => entry.value).join(' ');
    expect(said).toContain('No component carries a version');
    expect(said).toContain('lockfile');
  });

  it('keeps the declared range as a range', () => {
    const properties = doc([row()]).components[0]?.properties ?? [];
    expect(properties).toContainEqual({ name: 'sighttrue:declaredRange', value: '^1.6.0' });
  });

  it('says it covers direct dependencies only', () => {
    // Transitive dependencies are the larger part of any tree and are not here.
    const said = doc([row()]).metadata.properties.map((entry) => entry.value).join(' ');
    expect(said).toContain('Direct dependencies only');
    expect(said).toContain('Transitive dependencies are not included');
  });

  it('spells every purl the way its ecosystem does', () => {
    expect(doc([row()]).components[0]?.purl).toBe('pkg:npm/axios');
    expect(doc([row({ key: 'npm:@scope/thing', name: '@scope/thing' })]).components[0]?.purl).toBe(
      'pkg:npm/%40scope/thing',
    );
    // PyPI normalises case and any run of dot, dash or underscore to one dash.
    expect(doc([row({ key: 'pypi:pyyaml', name: 'PyYAML' })]).components[0]?.purl).toBe(
      'pkg:pypi/pyyaml',
    );
    expect(doc([row({ key: 'pypi:ruamel-yaml', name: 'ruamel.yaml' })]).components[0]?.purl).toBe(
      'pkg:pypi/ruamel-yaml',
    );
    expect(doc([row({ key: 'crates:serde_json', name: 'serde_json' })]).components[0]?.purl).toBe(
      'pkg:cargo/serde_json',
    );
  });

  it('attaches the readings as namespaced properties', () => {
    const properties = doc([row()]).components[0]?.properties ?? [];
    const named = Object.fromEntries(properties.map((entry) => [entry.name, entry.value]));

    expect(named['sighttrue:advisories']).toBe('12');
    expect(named['sighttrue:scorecard']).toBe('6.2');
    expect(named['sighttrue:busFactor']).toBe('3');
    expect(named['sighttrue:registryLastPublish']).toBe('2026-07-20');
    // Namespaced, so nothing here can be read as part of the standard.
    expect(properties.every((entry) => entry.name.startsWith('sighttrue:'))).toBe(true);
  });

  it('carries the publisher’s withdrawal and the install hooks when there are any', () => {
    const properties =
      doc([row({ withdrawn: 'no longer maintained', installScripts: 'postinstall' })]).components[0]
        ?.properties ?? [];
    const named = Object.fromEntries(properties.map((entry) => [entry.name, entry.value]));

    expect(named['sighttrue:withdrawnByPublisher']).toBe('no longer maintained');
    expect(named['sighttrue:runsOnInstall']).toBe('postinstall');
  });

  it('omits a reading it does not have rather than reporting a zero', () => {
    const properties =
      doc([row({ advisories: null, scorecard: null, busFactor: null, lastPublish: null })])
        .components[0]?.properties ?? [];
    const names = properties.map((entry) => entry.name);

    expect(names).not.toContain('sighttrue:advisories');
    expect(names).not.toContain('sighttrue:scorecard');
    expect(names).toContain('sighttrue:tracked');
  });

  it('links a component to its repository and its readings', () => {
    const references = doc([row()]).components[0]?.externalReferences ?? [];

    expect(references).toContainEqual({ type: 'vcs', url: 'https://github.com/axios/axios' });
    expect(references.some((entry) => entry.url === 'https://sighttrue.com/npm/axios')).toBe(true);
  });

  it('includes an untracked dependency, and marks it untracked', () => {
    // A bill of materials that silently dropped what this project has no
    // reading for would be a bill of some of the materials.
    const result = doc([
      row(),
      row({ key: 'npm:private-thing', name: 'private-thing', tracked: false, repo: null, license: null }),
    ]);

    expect(result.components).toHaveLength(2);
    const properties = result.components[1]?.properties ?? [];
    expect(properties).toContainEqual({ name: 'sighttrue:tracked', value: 'no' });
    expect(result.components[1]?.externalReferences).toBeUndefined();
  });

  it('never states whether a component is safe to use', () => {
    const said = JSON.stringify(doc([row({ withdrawn: 'unmaintained', archived: true })]));

    expect(said).not.toMatch(/"(risk|rating|grade|verdict|recommendation)"/i);
    expect(said).toMatch(/measurements, not assessments/);
  });
});

/**
 * The parser that feeds it, lifted out of the page and run.
 *
 * It reads what somebody pasted, and it now returns the declared range as well
 * as the name — a shape change in code that has no types and no compiler, in a
 * file where a mistake shows up as an empty result rather than an error.
 */
const names = new Function(
  `${/function names\(text\) \{[\s\S]*?\n  \}/.exec(STACK_SCRIPT)?.[0] ?? ''}; return names;`,
)() as (text: string) => Map<string, { shown: string; range: string }>;

describe('reading a pasted manifest', () => {
  it('keeps the range beside the name in package.json', () => {
    const found = names('{"dependencies":{"axios":"^1.6.0"},"devDependencies":{"vitest":"~4.0"}}');

    expect(found.get('npm:axios')).toEqual({ shown: 'axios', range: '^1.6.0' });
    expect(found.get('npm:vitest')).toEqual({ shown: 'vitest', range: '~4.0' });
  });

  it('keeps it in requirements.txt too, and keeps the name as spelled', () => {
    const found = names('PyYAML==6.0.1\nhttpx\n-r base.txt\n');

    expect(found.get('pypi:pyyaml')).toEqual({ shown: 'PyYAML', range: '==6.0.1' });
    expect(found.get('pypi:httpx')).toEqual({ shown: 'httpx', range: '' });
    // An include directive is not a package called base.
    expect(found.size).toBe(2);
  });

  it('reads a Cargo table and a bare version alike', () => {
    const found = names('[dependencies]\nserde = "1.0"\ntokio = { version = "1.40" }\n');

    expect(found.get('crates:serde')).toEqual({ shown: 'serde', range: '1.0' });
    expect(found.get('crates:tokio')?.shown).toBe('tokio');
  });
});
