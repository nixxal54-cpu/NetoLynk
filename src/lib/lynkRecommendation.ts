/**
 * lynkRecommendation.ts
 *
 * Client-side scoring for the "For You" feed.
 * A lightweight collaborative-filtering-style ranker that:
 *   - Weights watch-time / completion highest
 *   - Applies recency decay
 *   - Applies viral boost for new Lynks
 *   - Personalises with the current user's interaction history
 */
import { Lynk } from '../types/lynk';

// ─── Weight constants (tune without touching logic) ───────────────────────────
const W_WATCH_TIME       = 0.35;
const W_COMPLETION       = 0.25;
const W_LIKES            = 0.15;
const W_COMMENTS         = 0.10;
const W_SHARES           = 0.08;
const W_RECENCY          = 0.07;   // within last 24 h gets max score
const VIRAL_BOOST_FACTOR = 0.20;   // extra score while boostExpiresAt is in future

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a raw value into [0, 1] via a soft-log scale */
function softNorm(value: number, scale: number): number {
  return Math.min(Math.log1p(value) / Math.log1p(scale), 1);
}

/** Hours since the Lynk was created (capped at 168 h = 1 week) */
function hoursOld(createdAt: string): number {
  return Math.min((Date.now() - new Date(createdAt).getTime()) / 3_600_000, 168);
}

/** Recency score: 1.0 = just posted, 0 = 1 week old, linear decay */
function recencyScore(createdAt: string): number {
  return Math.max(0, 1 - hoursOld(createdAt) / 168);
}

/** Viral boost: extra multiplier if within boost window */
function viralBoostMultiplier(lynk: Lynk): number {
  if (!lynk.boostExpiresAt) return 1;
  return new Date(lynk.boostExpiresAt) > new Date() ? 1 + VIRAL_BOOST_FACTOR : 1;
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Score a single Lynk.
 *
 * @param lynk           The Lynk to score
 * @param seenLynkIds    Set of Lynk IDs the user has already watched (de-dup)
 * @param likedLynkIds   Set of Lynk IDs the user has liked (personalisation)
 */
export function scoreLynk(
  lynk: Lynk,
  seenLynkIds: Set<string>,
  likedLynkIds: Set<string>
): number {
  // Already fully watched — push to the bottom so feed stays fresh
  if (seenLynkIds.has(lynk.id)) return -1;

  // Normalisation reference scales (based on typical viral content)
  const avgWatchSeconds = lynk.duration > 0 ? lynk.totalWatchSeconds / Math.max(lynk.viewsCount, 1) : 0;
  const watchTimeScore  = softNorm(avgWatchSeconds, 60);           // 60 s ref
  const completionScore = Math.min(lynk.completionRate, 1);
  const likeScore       = softNorm(lynk.likesCount, 10_000);
  const commentScore    = softNorm(lynk.commentsCount, 1_000);
  const shareScore      = softNorm(lynk.sharesCount, 500);
  const recency         = recencyScore(lynk.createdAt);

  let score =
    W_WATCH_TIME  * watchTimeScore  +
    W_COMPLETION  * completionScore +
    W_LIKES       * likeScore       +
    W_COMMENTS    * commentScore    +
    W_SHARES      * shareScore      +
    W_RECENCY     * recency;

  // Personalisation bump: user has liked similar content (same hashtags would be
  // ideal but we do a quick proxy — liked content from same creator gets a boost)
  if (likedLynkIds.has(lynk.id)) score *= 1.1;   // should not appear again, just safety

  // Viral boost
  score *= viralBoostMultiplier(lynk);

  return score;
}

/**
 * Rank a batch of Lynks for the "For You" feed.
 * Returns them sorted highest-score first, with seen content filtered out.
 */
export function rankFeed(
  lynks: Lynk[],
  seenLynkIds: Set<string>,
  likedLynkIds: Set<string>
): Lynk[] {
  return lynks
    .map((l) => ({ lynk: l, score: scoreLynk(l, seenLynkIds, likedLynkIds) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(({ lynk }) => lynk);
}

// ─── Session history store (in-memory, resets per session) ────────────────────

class LynkSessionHistory {
  private seen    = new Set<string>();
  private liked   = new Set<string>();
  private userHashtags = new Map<string, number>(); // tag → interaction count

  markSeen(lynkId: string)  { this.seen.add(lynkId);  }
  markLiked(lynkId: string) { this.liked.add(lynkId); }
  markHashtags(tags: string[]) {
    tags.forEach((t) => this.userHashtags.set(t, (this.userHashtags.get(t) ?? 0) + 1));
  }

  get seenIds()  { return this.seen;  }
  get likedIds() { return this.liked; }

  /** Top hashtags this session for content affinity */
  topHashtags(n = 5): string[] {
    return [...this.userHashtags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([tag]) => tag);
  }

  reset() {
    this.seen.clear();
    this.liked.clear();
    this.userHashtags.clear();
  }
}

export const sessionHistory = new LynkSessionHistory();
