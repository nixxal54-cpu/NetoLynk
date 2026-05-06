// src/lib/lynkRecommendation.ts

class InteractionTracker {
  private prefs: Record<string, number> = {};

  constructor() {
    const saved = localStorage.getItem('netolynk_lynk_prefs');
    if (saved) this.prefs = JSON.parse(saved);
  }

  trackCategory(category: string, weight: number) {
    this.prefs[category] = (this.prefs[category] || 0) + weight;
    localStorage.setItem('netolynk_lynk_prefs', JSON.stringify(this.prefs));
  }

  getPreferred(): string[] {
    return Object.entries(this.prefs)
      .sort((a, b) => b[1] - a[1])
      .map(([cat]) => cat).slice(0, 3);
  }
}

export const interactionTracker = new InteractionTracker();

export function calculateLynkScore(lynk: any): number {
  const m = lynk.metrics;
  
  // A skip is defined as watchTime < 2 seconds
  const watchTimeRatio = m.duration > 0 ? (m.totalWatchTime / m.duration) : 0;
  
  // Recency Decay (Max 24h)
  const hoursOld = (Date.now() - new Date(lynk.createdAt).getTime()) / 3600000;
  const recencyMultiplier = hoursOld < 24 ? (24 - hoursOld) / 24 : 0.1;

  // The Addictive Formula
  const baseScore = 
    (m.likes * 3) + 
    (m.comments * 5) + 
    (watchTimeRatio * 8) + 
    (m.replays * 4) - 
    (m.skips * 6);

  return (baseScore * recencyMultiplier) + (lynk.boostScore || 0);
}
