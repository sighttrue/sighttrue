import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { bearerFrom, decide, type EntitlementRow } from '../src/lib/entitlement.ts';
import { FREE_TOOLS, MCP_TOOLS, PAID_TOOLS, toolByName } from '../src/lib/mcp-catalogue.ts';
import { PLANS } from '../src/lib/plans.ts';

/**
 * The only rule here where being wrong costs somebody money, or hands over what
 * somebody paid for. Tested as pure logic for that reason.
 */

const NOW = '2026-08-10T00:00:00Z';
const sub = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  planId: 'watch',
  validUntil: '2026-09-10T00:00:00Z',
  callsRemaining: null,
  ...over,
});

describe('what a caller may reach', () => {
  it('never refuses a free tool, whatever the key says', () => {
    // Anything already given away stays given away. A lapsed subscriber keeps
    // everything they had before they ever paid, because an instrument caught
    // withdrawing a published reading has lost the argument it is making.
    for (const entitlement of [null, sub({ validUntil: '2020-01-01T00:00:00Z' }), sub({ callsRemaining: 0 })]) {
      expect(decide('free', entitlement, NOW).allowed).toBe(true);
    }
  });

  it('refuses a paid tool with no key, and says where to get one', () => {
    const decision = decide('paid', null, NOW);

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.status).toBe(401);
    // An agent reads this and has to decide whether to tell its user to buy
    // access. "Unauthorized" alone does not let it.
    expect(decision.message).toContain('free tools');
  });

  it('separates an expired subscription from an empty credit pack', () => {
    // Different facts and different fixes: one renews, the other tops up.
    const expired = decide('paid', sub({ validUntil: '2026-08-01T00:00:00Z' }), NOW);
    const empty = decide('paid', sub({ planId: 'credits', validUntil: null, callsRemaining: 0 }), NOW);

    expect(expired.allowed).toBe(false);
    expect(empty.allowed).toBe(false);
    if (expired.allowed || empty.allowed) return;
    expect(expired.reason).toBe('expired');
    expect(empty.reason).toBe('no-credit');
    expect(expired.status).toBe(402);
  });

  it('lets a subscription run without spending anything', () => {
    // A subscription has no meter. Decrementing one would empty a column that
    // should stay null for the life of the account.
    const decision = decide('paid', sub(), NOW);

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.spendsCredit).toBe(false);
  });

  it('spends a credit only on a metered plan', () => {
    const decision = decide('paid', sub({ planId: 'credits', validUntil: null, callsRemaining: 5 }), NOW);

    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.spendsCredit).toBe(true);
  });

  it('treats the expiry as a moment, not a day', () => {
    const entitlement = sub({ validUntil: NOW });
    expect(decide('paid', entitlement, NOW).allowed).toBe(false);
    expect(decide('paid', entitlement, '2026-08-09T23:59:59Z').allowed).toBe(true);
  });
});

describe('reading the header', () => {
  it('takes a bearer token however the client cased the scheme', () => {
    expect(bearerFrom('Bearer abc123')).toBe('abc123');
    expect(bearerFrom('bearer abc123')).toBe('abc123');
    expect(bearerFrom('  Bearer   abc123  ')).toBe('abc123');
  });

  it('refuses anything else rather than repairing it into a lookup', () => {
    for (const header of [null, '', 'abc123', 'Basic abc123', 'Bearer', 'Bearer a b']) {
      expect(bearerFrom(header)).toBeNull();
    }
  });
});

describe('the catalogue', () => {
  it('names every tool once', () => {
    const names = MCP_TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every tool the server already answers free', () => {
    // Read out of the endpoint rather than listed here. Written by hand this
    // named three, and the server was already answering eight — so a catalogue
    // that moved five of them behind a gate passed the test that existed to
    // prevent exactly that. Anything the server answers today was published
    // with no key and no account, and taking one back is the single change
    // this project cannot make.
    const source = readFileSync(
      fileURLToPath(new URL('../functions/api/mcp.ts', import.meta.url)),
      'utf8',
    );
    const served = [...source.matchAll(/toolName === '([a-z_]+)'/g)].map((match) => match[1] as string);

    expect(served.length, 'the endpoint dispatches tools by name').toBeGreaterThan(0);
    for (const name of new Set(served)) {
      expect(toolByName(name), `${name} is served but not catalogued`).toBeDefined();
      expect(toolByName(name)?.tier, `${name} is answered today and must stay free`).toBe('free');
    }
  });

  it('matches the count the pricing page promises', () => {
    // The page said "All seven MCP tools" while the server had three, because
    // the two were written in different files and nothing compared them.
    const free = PLANS.find((plan) => plan.id === 'free');
    const claim = free?.includes.find((line) => line.includes('MCP tools'));

    expect(claim, 'the free plan says something about MCP tools').toBeDefined();
    expect(claim).toContain(String(FREE_TOOLS.length));
  });

  it('can say why every paid tool is worth paying for', () => {
    // A tool that cannot fill this in honestly should not be behind a gate.
    for (const tool of PAID_TOOLS) {
      expect(tool.because.length, `${tool.name} needs a reason`).toBeGreaterThan(40);
    }
  });

  it('describes every tool for the agent choosing between them', () => {
    for (const tool of MCP_TOOLS) {
      expect(tool.description.length, `${tool.name}`).toBeGreaterThan(60);
      // Never a recommendation. An agent handed a field that sounds like advice
      // will report it as advice.
      for (const word in { safe: 1, recommended: 1, best: 1 }) {
        expect(tool.description.toLowerCase()).not.toContain(` ${word} `);
      }
    }
  });
});
