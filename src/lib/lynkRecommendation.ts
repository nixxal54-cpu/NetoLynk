// src/lib/lynkRecommendation.ts
import { Lynk, LynkCategory } from '../types/lynk';

class InteractionTracker {
  private likedCategories: Record<string, number> = {};

  // Track user preferences in memory/localStorage
  markLiked(category: LynkCategory) {
    this.likedCategories[category] = (this.likedCategories[category] || 0) + 1;
  }

  getPreferredCategories(): string[] {
    return Object.entries(this.likedCategories)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat)
      .slice(0, 3); // Top 3 preferred
  }
}

export const lynkInteractionTracker = new InteractionTracker();

export function calculateLynkScore(lynk: Lynk): number {
  const likes = lynk.likesCount || 0;
  const comments = lynk.commentsCount || 0;
  
  // Recent boost: Posts under 24 hours old get a heavy multiplier
  const hoursOld = (Date.now() - new Date(lynk.createdAt).getTime()) / 3600000;
  const recencyMultiplier = hoursOld < 24 ? (24 - hoursOld) / 2 : 1;

  // Base score = (Likes * 3) + (Comments * 5)
  return ((likes * 3) + (comments * 5)) * recencyMultiplier + (lynk.boostScore || 0);
}

export function buildMixedFeed(allLynks: Lynk[], seenIds: Set<string>): Lynk[] {
  const unseen = allLynks.filter(l => !seenIds.has(l.id));
  
  // Sort by calculated score
  const scored = unseen.map(l => ({ ...l, score: calculateLynkScore(l) }));
  scored.sort((a, b) => b.score - a.score);

  const preferredCats = lynkInteractionTracker.getPreferredCategories();
  
  const preferredPool = scored.filter(l => preferredCats.includes(l.category));
  const trendingPool = scored.filter(l => !preferredCats.includes(l.category));
  const randomPool = [...unseen].sort(() => Math.random() - 0.5); // Fast shuffle

  const feed: Lynk[] =[];
  const targetSize = Math.min(10, unseen.length); // Batch size

  // 50% Preferred, 30% Trending, 20% Random
  const pCount = Math.floor(targetSize * 0.5);
  const tCount = Math.floor(targetSize * 0.3);

  feed.push(...preferredPool.splice(0, pCount));
  feed.push(...trendingPool.splice(0, tCount));
  
  // Fill remainder with random to hit batch size
  while (feed.length < targetSize && randomPool.length > 0) {
    const randomLynk = randomPool.pop()!;
    if (!feed.some(f => f.id === randomLynk.id)) {
      feed.push(randomLynk);
    }
  }

  // Final shuffle to blend them naturally
  return feed.sort(() => Math.random() - 0.5);
}
