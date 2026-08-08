import type { AssertExhaustive } from './keys.ts';

/**
 * What the registry says about a package, from the one document it publishes.
 *
 * The publish date came first and is still the reason this exists: it is
 * distinct from anything GitHub says, and the two disagree more often than
 * people expect. A repository can have commits this week and a package nobody
 * has shipped in two years — commits are what a maintainer does for themselves,
 * a publish is what reaches the people depending on them.
 *
 * The four fields below it were in the same response all along and were being
 * thrown away. None costs a request.
 */
export interface StalenessRow {
  registry: string;
  name: string;
  /** Watched repository this package belongs to, for the link back. */
  repo: string;
  /** ISO 8601 date of the newest published version, or null when unreadable. */
  lastPublish: string | null;
  /** The version that date belongs to. */
  version: string | null;
  /**
   * The registry's own withdrawal notice, or null.
   *
   * npm calls it deprecated and carries a reason; PyPI and crates.io call it
   * yanked and sometimes say why. All three mean the publisher is telling you
   * not to install this. The text is theirs, truncated, never paraphrased.
   *
   * Null is "not withdrawn" only once the row has been read since this field
   * existed. Before that it is "never looked at", and the two serialise the
   * same way — see the collector for what is not claimed because of it.
   */
  withdrawn: string | null;
  /**
   * Install-time scripts the registry publishes for the newest version.
   *
   * npm runs `preinstall`, `install` and `postinstall` on the installing
   * machine, which is the main path by which a compromised npm package becomes
   * code execution. Naming them is a fact about the package; it is not a claim
   * that any of them is malicious, and most are not.
   *
   * Null on PyPI and crates.io, which publish no equivalent field. Null there
   * means unpublished, not absent.
   */
  installScripts: string | null;
  /** Bytes the published artefact unpacks to, or downloads as. */
  bytes: number | null;
  /** Where the maintainers ask to be funded, as the registry lists it. */
  funding: string | null;
  observedAt: string;
}

export const STALENESS_KEYS = [
  'registry',
  'name',
  'repo',
  'lastPublish',
  'version',
  'withdrawn',
  'installScripts',
  'bytes',
  'funding',
  'observedAt',
] as const satisfies readonly (keyof StalenessRow)[];

export type _StalenessKeysExhaustive = AssertExhaustive<
  Exclude<keyof StalenessRow, (typeof STALENESS_KEYS)[number]>
>;
