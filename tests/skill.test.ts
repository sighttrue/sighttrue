import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FREE_TOOLS } from '../src/lib/mcp-catalogue.ts';

/**
 * The instruction an agent installs.
 *
 * The only artefact here that tells another system what to do. Everything else
 * on this project reports; this instructs, which makes it the one place a
 * careless sentence becomes somebody's agent giving bad advice at scale.
 *
 * Shaped to the guidance rather than to taste: a description that reads like a
 * routing rule, a body under roughly 500 tokens, and detail pushed into
 * references loaded only when they apply. A skill whose body carries five
 * subjects has to describe all five, and a description that broad either never
 * fires or fires constantly.
 */

const path = (name: string) => fileURLToPath(new URL(name, import.meta.url));
const read = (name: string) => readFileSync(path(name), 'utf8');

const SKILL = read('../skill/SKILL.md');
const REFERENCES = readdirSync(path('../skill/references')).filter((f) => f.endsWith('.md'));

describe('the skill body', () => {
  it('stays lean enough to be loaded on every relevant turn', () => {
    // Roughly 1.35 tokens a word. The guidance is under 500; this is the
    // measurement that stops the body reabsorbing the references over time.
    const words = SKILL.split(/\s+/).filter(Boolean).length;
    expect(Math.round(words * 1.35)).toBeLessThan(600);
  });

  it('carries a description specific enough to route on', () => {
    expect(SKILL.startsWith('---\n')).toBe(true);
    expect(SKILL).toContain('name: sighttrue');

    const description = /description:(.*)/.exec(SKILL)?.[1] ?? '';
    // Names the moments it should fire on. A vague one is worse than none: it
    // fires on everything and the agent learns to ignore it.
    for (const trigger of ['dependency', 'base image', 'model', 'maintained']) {
      expect(description, `description should name ${trigger}`).toContain(trigger);
    }
  });

  it('points at every reference it ships, and ships every one it points at', () => {
    for (const file of REFERENCES) {
      expect(SKILL, `${file} is shipped but never referenced`).toContain(`references/${file}`);
    }
    for (const mentioned of SKILL.matchAll(/references\/([a-z]+\.md)/g)) {
      expect(REFERENCES, `${mentioned[1]} is referenced but not shipped`).toContain(mentioned[1]);
    }
  });
});

describe('what it tells an agent to do', () => {
  it('requires the source to travel with the reading', () => {
    // Quoting the source is the entire advantage of a reading over a
    // recollection. An instruction that drops it throws that away.
    expect(SKILL).toContain('Quote the source');
    expect(SKILL).toContain('one click');
  });

  it('forbids turning a measurement into a verdict', () => {
    expect(SKILL).toContain('Never convert a measurement into a verdict');
    expect(SKILL).toContain('never "this package is unsafe"');
  });

  it('says a quiet result is not a clean bill', () => {
    // The failure that matters most: an agent reading "nothing found" as
    // "nothing wrong" about something on nobody's watchlist.
    expect(SKILL).toContain('quiet result is not a clean bill');
  });

  it('states what it cannot do', () => {
    expect(SKILL).toContain('does not read or run any code');
  });
});

describe('the references', () => {
  it('refuses to publish an availability percentage', () => {
    // The arithmetic is trivial and the answer is wrong in the most damaging
    // direction: only announced incidents are on record, so a provider that
    // announces more looks worse than one that announces less. The site
    // refuses this figure and the instruction must refuse it too.
    expect(read('../skill/references/providers.md')).toContain(
      'Never state an availability percentage',
    );
  });

  it('refuses to rank models by quality', () => {
    expect(read('../skill/references/models.md')).toContain('Never rank models by quality');
  });

  it('says a long publishing gap is not abandonment', () => {
    expect(read('../skill/references/dependencies.md')).toContain('a finished library is finished');
  });

  it('promises the free tool count the catalogue holds', () => {
    // Written into an instruction, so it drifts unless something checks — the
    // pricing page carried "seven MCP tools" for weeks against a server
    // answering eight.
    const registries = read('../skill/references/dependencies.md');
    expect(registries).toContain('no key and no account');
    expect(FREE_TOOLS.length).toBeGreaterThan(0);
  });
});

describe('the copy the package ships', () => {
  it('is identical to the repository’s, file for file', () => {
    // Two trees, because the npm package cannot reach outside its directory.
    const shipped = readdirSync(path('../cli/skill/references')).filter((f) => f.endsWith('.md'));
    expect(shipped.sort()).toEqual([...REFERENCES].sort());

    expect(read('../cli/skill/SKILL.md')).toBe(SKILL);
    for (const file of REFERENCES) {
      expect(read(`../cli/skill/references/${file}`), file).toBe(read(`../skill/references/${file}`));
    }
  });
});
