import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { FREE_TOOLS } from '../src/lib/mcp-catalogue.ts';

/**
 * The instruction an agent installs.
 *
 * It is the only artefact here that tells another system what to do, which
 * makes it the one place a careless sentence turns into somebody's agent giving
 * bad advice at scale. Everything else on this project reports; this instructs.
 */

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const SKILL = read('../skill/SKILL.md');
const SHIPPED = read('../cli/SKILL.md');

describe('the agent skill', () => {
  it('ships the same file the repository holds', () => {
    // Two copies, because the npm package cannot reach outside its own
    // directory. A test rather than a hope, which is how every other duplicated
    // file here is kept honest.
    expect(SHIPPED).toBe(SKILL);
  });

  it('carries the front matter an agent loads it by', () => {
    expect(SKILL.startsWith('---\n')).toBe(true);
    expect(SKILL).toContain('name: sighttrue');
    // The description is what decides whether the skill is invoked at all. A
    // vague one means it never fires, and the reading never gets taken.
    expect(SKILL).toMatch(/description:.*(maintained|dependency)/);
  });

  it('tells the agent to cite rather than assert', () => {
    // Quoting the source is the entire advantage of a reading over a
    // recollection. An instruction that drops it throws that away.
    expect(SKILL).toContain('Quote the source');
    expect(SKILL).toContain('check it in one click');
  });

  it('forbids turning a measurement into a verdict', () => {
    // The tools deliberately return no score and no recommendation. An agent
    // told to summarise would invent one, and it would carry this project's
    // name.
    expect(SKILL).toContain('Do not convert a measurement into a verdict');
    expect(SKILL).toContain('not "this package is unsafe"');
  });

  it('says a quiet result is not a clean bill', () => {
    // The failure mode that matters most: an agent reading "nothing found" as
    // "nothing wrong" about a package on nobody's watchlist.
    expect(SKILL).toContain('quiet result is not a clean bill');
  });

  it('states what it cannot do', () => {
    expect(SKILL).toContain('It does not read the code');
  });

  it('promises the free tool count the catalogue actually holds', () => {
    // Written into the instruction, so it drifts unless something checks. The
    // pricing page carried "seven MCP tools" for weeks against a server
    // answering eight, for exactly this reason.
    expect(SKILL).toContain(`${FREE_TOOLS.length} free tools`);
  });
});
