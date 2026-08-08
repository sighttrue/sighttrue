import { readAllEvents, readAnnouncements, writeAnnouncements } from '../lib/ledger.ts';
import { templatedSentence } from '../lib/validate.ts';
import { createXClient, postLength, MAX_POST_LENGTH, type XClient } from '../lib/x.ts';
import { eventPath } from '../site/event.ts';
import { SITE_ORIGIN } from '../site/render.ts';
import type { EventRecord } from '../types/events.ts';

/**
 * The agent announces its own findings.
 *
 * This is the distribution mechanism. Nobody has to remember to post, and a
 * competitor cannot copy it without also building the instrument behind it.
 *
 * Only `confirmed` findings are eligible. That is the rule the whole confidence
 * ladder exists to serve: a detection that evaporates tomorrow must never have
 * left the site, and a post is the one thing that cannot be taken back.
 */

/**
 * Kept low deliberately, and now low enough for the cadence.
 *
 * This runs on every pulse rather than once a day, which is seven runs and not
 * one. Four apiece would be twenty-eight posts a day — noise on the timeline
 * and, more decisively, over the API's own ceiling. See `MONTHLY_CAP`.
 */
const DEFAULT_POSTS_PER_RUN = 2;

/**
 * X's free tier allows 500 posts a month. This stops at 400.
 *
 * The headroom is not caution for its own sake: hitting the cap means every
 * subsequent post fails until the calendar month turns, and the findings that
 * fail are whichever ones happened to be at the end of the month. A budget that
 * runs out silently chooses what goes unsaid.
 */
export const MONTHLY_CAP = 400;

/**
 * How old a finding may be and still be news.
 *
 * A backlog is not an announcement. The ledger holds every confirmed finding
 * ever recorded, and the first run with working credentials would otherwise
 * post three-week-old readings as though they had just happened — which is a
 * false claim about when something occurred, made by a project whose whole
 * argument is that its dates are right.
 */
export const MAX_AGE_HOURS = 48;

/**
 * Which findings are worth somebody's timeline.
 *
 * `confirmed` is the floor, not the bar. Everything below is a reading that
 * changes what somebody would do: a project's licence moved, a maintainer
 * archived it, a model's price changed, a support window is closing, forks are
 * running well above a peer group.
 *
 * Two kinds are deliberately absent. `release` is confirmed and there are
 * twenty to forty a day, almost all of them patch bumps — the ships lens is the
 * right place to read those, and a timeline that carries all of them carries
 * nothing else. `demand-cluster` never reaches `confirmed`, by design.
 */
export const ANNOUNCEABLE: ReadonlySet<string> = new Set([
  'fork-spike',
  'fork-outlier',
  'dependency-shift',
  'licence',
  'archived',
  'model-price',
  'model-withdrawn',
  'eol-approaching',
  'lineage',
]);

export interface AnnounceOptions {
  client?: XClient;
  now?: Date;
  limit?: number;
  /** Calendar-month ceiling. Lowered in tests, never raised in production. */
  monthlyCap?: number;
  maxAgeHours?: number;
}

export interface AnnounceResult {
  eligible: number;
  posted: number;
  failed: string[];
  skipped: number;
  /** Posts already made this calendar month, before this run. */
  postedThisMonth: number;
  /** True when the monthly ceiling stopped this run early. */
  capped: boolean;
}

/**
 * What the post says.
 *
 * The templated sentence, not the generated one. Templates are assembled from
 * the record and are certainly true; a fluent sentence that might not be is
 * exactly the wrong thing to put somewhere it cannot be edited. No hashtags, no
 * exclamation, no adjectives — the numbers are the point.
 */
export function composePost(event: EventRecord): string | null {
  const sentence = event.kind === 'correction' ? correctionSentence(event) : templatedSentence(event);
  if (sentence === null) return null;

  const text = `${sentence}\n\n${SITE_ORIGIN}${eventPath(event)}`;
  return postLength(text) > MAX_POST_LENGTH ? null : text;
}

/**
 * A withdrawal, said out loud in the place the claim was made.
 *
 * A finding that went to the timeline and was later retracted cannot be
 * corrected by deleting the page: the post is what people saw. The reason comes
 * from the correction's own record, and the sentence leads with the withdrawal
 * so it cannot be read at a glance as a fresh finding.
 */
function correctionSentence(event: EventRecord): string | null {
  const reason = event.metrics['reason'];
  const withdrawn = event.metrics['withdrawn'];
  if (typeof withdrawn !== 'string') return null;

  const because = typeof reason === 'string' && reason !== '' ? ` ${reason}` : '';
  return `Withdrawn: an earlier ${withdrawn} finding for ${event.repo} was wrong.${because}`;
}

export async function runAnnounce(options: AnnounceOptions = {}): Promise<AnnounceResult> {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const limit = options.limit ?? DEFAULT_POSTS_PER_RUN;

  const client =
    options.client ??
    createXClient({
      credentials: {
        apiKey: process.env['X_API_KEY'] ?? '',
        apiSecret: process.env['X_API_SECRET'] ?? '',
        accessToken: process.env['X_ACCESS_TOKEN'] ?? '',
        accessSecret: process.env['X_ACCESS_SECRET'] ?? '',
      },
    });

  const announced = new Map(readAnnouncements().map((row) => [row.eventId, row]));
  const all = readAllEvents();

  const superseded = new Set(
    all.map((event) => event.supersedes).filter((id): id is string => id !== null),
  );

  const freshAfter =
    now.getTime() - (options.maxAgeHours ?? MAX_AGE_HOURS) * 3_600_000;

  const isFresh = (event: EventRecord): boolean => {
    const at = Date.parse(event.detectedAt);
    return !Number.isNaN(at) && at >= freshAfter;
  };

  const eligible = all.filter((event) => {
    if (announced.has(event.id)) return false;

    // A retraction of something already said publicly. It goes to the same
    // place with the same prominence as the claim, which is the entire point of
    // recording corrections rather than deleting findings — and it is the only
    // kind exempt from the confirmed rule, because the claim it withdraws was
    // itself confirmed.
    if (event.kind === 'correction') {
      return event.supersedes !== null && announced.get(event.supersedes)?.state === 'posted';
    }

    return (
      event.confidence === 'confirmed' &&
      // Confirmed is the floor. This is the bar: a reading that changes what
      // somebody would do, rather than every tag anybody pushed today.
      ANNOUNCEABLE.has(event.kind) &&
      // A backlog is not news. Without this the first run with credentials
      // posts three-week-old readings as though they had just happened.
      isFresh(event) &&
      // A finding that has since been retracted must never be announced, even
      // if it was confirmed when it was recorded.
      !superseded.has(event.id)
    );
  });

  // Somebody else's ceiling, counted from this project's own record of what it
  // sent. Calendar month, because that is the window the quota resets on.
  const month = nowIso.slice(0, 7);
  const postedThisMonth = [...announced.values()].filter(
    (row) => row.state === 'posted' && row.announcedAt.slice(0, 7) === month,
  ).length;
  const remaining = Math.max(0, (options.monthlyCap ?? MONTHLY_CAP) - postedThisMonth);

  const failed: string[] = [];
  let posted = 0;
  let skipped = 0;

  for (const event of eligible.slice(0, Math.min(limit, remaining))) {
    const text = composePost(event);

    if (text === null) {
      // No sentence can be built from this record that is both true and short
      // enough. Recording the skip stops it being reconsidered every run.
      skipped += 1;
      announced.set(event.id, {
        eventId: event.id,
        state: 'failed',
        postId: null,
        text: null,
        error: 'no sentence could be assembled within the length limit',
        announcedAt: nowIso,
      });
      continue;
    }

    try {
      const result = await client.post(text);
      posted += 1;
      announced.set(event.id, {
        eventId: event.id,
        state: 'posted',
        postId: result.id,
        text,
        error: null,
        announcedAt: nowIso,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push(`${event.id}: ${message}`);
      // Not recorded, so the next run retries. A transport failure is not an
      // answer, and an unposted finding should not be silently dropped.
    }
  }

  // Only when something changed. An empty run must not rewrite the file and
  // produce a commit that says an announcement happened.
  if (posted > 0 || skipped > 0) writeAnnouncements([...announced.values()]);

  return {
    eligible: eligible.length,
    posted,
    failed,
    skipped,
    postedThisMonth,
    capped: remaining < Math.min(limit, eligible.length),
  };
}
