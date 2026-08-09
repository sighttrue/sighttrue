/**
 * Adoption, reduced to what the page needs.
 *
 * Pure, so the one arithmetic decision here — which windows may be added
 * together — is testable rather than buried in the build.
 */

import type { AdoptionReading, AdoptionSummary } from '../types/bundles.ts';
import type { AdoptionRow } from '../types/adoption.ts';

/** Enough to fill a screen and stop well short of a directory. */
const TOP = 24;

/**
 * Registries whose counts cover the same period and may therefore be summed.
 *
 * npm and PyPI both report a rolling week. Homebrew reports thirty days and
 * crates.io ninety, and adding those to a weekly figure produces a number that
 * measures nothing — it is not a week, not a month, and not comparable to
 * either. They appear in the table with their own windows and nowhere else.
 */
const WEEKLY: ReadonlySet<string> = new Set(['npm', 'pypi']);

function reading(row: AdoptionRow & { count: number }): AdoptionReading {
  return {
    repo: row.id,
    registry: row.registry,
    name: row.name,
    count: row.count,
    window: row.window,
  };
}

function ranked(rows: readonly (AdoptionRow & { count: number })[]): AdoptionReading[] {
  return [...rows]
    .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))
    .slice(0, TOP)
    .map(reading);
}

export function summariseAdoption(rows: readonly AdoptionRow[]): AdoptionSummary {
  const read = rows.filter((row): row is AdoptionRow & { count: number } => row.count !== null);
  const weeklyRows = read.filter((row) => WEEKLY.has(row.registry));

  // Split before ranking, not after. RubyGems, Packagist and NuGet publish a
  // running total since the package first shipped; NuGet's largest is around
  // six billion, against roughly sixty million for the biggest weekly figure
  // here. In one ranked table that total takes first place and sets the bar
  // scale, and every weekly count beside it renders as a sliver — each number
  // true, the comparison between them false. So they are ranked separately and
  // drawn against separate scales.
  const windowed = read.filter((row) => row.window !== 'total');
  const lifetime = read.filter((row) => row.window === 'total');

  return {
    measured: read.length,
    unread: rows.length - read.length,
    weekly: weeklyRows.reduce((total, row) => total + row.count, 0),
    weeklyPackages: weeklyRows.length,
    top: ranked(windowed),
    lifetime: ranked(lifetime),
  };
}
