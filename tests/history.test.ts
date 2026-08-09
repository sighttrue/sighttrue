import { describe, expect, it } from 'vitest';

import { archiveIndex } from '../src/lib/history.ts';

/**
 * The index over the one dataset here that cannot be rebuilt.
 *
 * Every other file the site publishes is derived: delete it and tomorrow's run
 * restores it. A lost day of history is lost, because GitHub publishes what a
 * repository's star count is and never what it was last Tuesday. So the
 * assertions below are mostly about not overstating what is held.
 */

const day = (date: string, rows = 400, bytes = 35_000) => ({ date, rows, bytes });

describe('the archive index', () => {
  it('puts the newest day first whatever order it was handed', () => {
    const index = archiveIndex([day('2026-08-07'), day('2026-08-05'), day('2026-08-09')]);

    expect(index.days.map((entry) => entry.date)).toEqual([
      '2026-08-09',
      '2026-08-07',
      '2026-08-05',
    ]);
  });

  it('reads its own endpoints off the data rather than off a constant', () => {
    // An archive that claims to start in January because a constant says
    // January is exactly the failure this project exists to point at in other
    // people's dashboards.
    const index = archiveIndex([day('2026-08-07'), day('2026-08-05'), day('2026-08-09')]);

    expect(index.from).toBe('2026-08-05');
    expect(index.to).toBe('2026-08-09');
  });

  it('counts days held separately from the span between the endpoints', () => {
    // A failed run writes no snapshot. Five days between the first and last
    // with three on file is a gap, and reporting the span as the count would
    // claim two days of readings that were never taken.
    const index = archiveIndex([day('2026-08-05'), day('2026-08-07'), day('2026-08-09')]);

    expect(index.measured).toBe(3);
    expect(index.from).toBe('2026-08-05');
    expect(index.to).toBe('2026-08-09');
  });

  it('totals the rows across every day', () => {
    const index = archiveIndex([day('2026-08-08', 388), day('2026-08-09', 417)]);
    expect(index.rows).toBe(805);
  });

  it('says nothing rather than zero about an empty archive', () => {
    const index = archiveIndex([]);

    expect(index.measured).toBe(0);
    expect(index.rows).toBe(0);
    // Null, not a date. A first run has no archive, and inventing an endpoint
    // for it would be the same lie as inventing a reading.
    expect(index.from).toBeNull();
    expect(index.to).toBeNull();
  });
});
