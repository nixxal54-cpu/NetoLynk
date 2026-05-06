// src/lib/lynkRecommendation.ts

export function calculateLynkScore(lynk: any): number {
  const m = lynk.metrics;
  
  // 1. Cap inputs to prevent algorithmic gaming
  const safeReplays = Math.min(m.replays, 3); // Max 3 replays count per view
  
  // Guard against division by zero & cap at 200% completion rate (to prevent bot farming)
  const rawWatchRatio = m.duration > 0 ? (m.totalWatchTime / m.duration) : 0;
  const safeWatchRatio = Math.min(rawWatchRatio, 2.0); 

  // 2. Exponential Recency Decay
  const hoursOld = Math.max((Date.now() - new Date(lynk.createdAt).getTime()) / 3600000, 0);
  const recencyMultiplier = Math.max(Math.pow(0.95, hoursOld), 0.1); // Slowly decays, bottoms out at 10%
  
  // 3. Decaying Boost Score (Loses 10% of its power every hour)
  const decayedBoost = (lynk.boostScore || 0) * Math.pow(0.9, hoursOld);

  // 4. Final Score
  const baseScore = 
    (m.likes * 3) + 
    (m.comments * 5) + 
    (safeWatchRatio * 8) + 
    (safeReplays * 4) - 
    (m.skips * 6); // Skips actively bury bad content

  return Math.max((baseScore * recencyMultiplier) + decayedBoost, 0); // No negative scores
}
