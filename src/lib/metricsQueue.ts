// src/lib/metricsQueue.ts
import { writeBatch, doc, increment } from 'firebase/firestore';
import { db } from './firebase';

interface LynkMetrics {
  watchTime: number;
  skips: number;
  replays: number;
}

class MetricsSyncQueue {
  private queue = new Map<string, LynkMetrics>();
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    // Force flush if user closes the tab or switches apps
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flush();
    });
  }

  track(lynkId: string, seconds: number, isSkip: boolean, replays: number) {
    const current = this.queue.get(lynkId) || { watchTime: 0, skips: 0, replays: 0 };
    
    // Anti-abuse limits applied at the source
    this.queue.set(lynkId, {
      watchTime: current.watchTime + seconds,
      skips: current.skips + (isSkip ? 1 : 0),
      replays: current.replays + Math.min(replays, 3) // Cap replays at 3 per session
    });

    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 15000); // Batch every 15s
    }
  }

  async flush() {
    if (this.queue.size === 0) return;

    const batch = writeBatch(db);
    const entries = Array.from(this.queue.entries());
    this.queue.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    // Firestore batches handle max 500 ops.
    entries.slice(0, 490).forEach(([lynkId, metrics]) => {
      batch.update(doc(db, 'lynks', lynkId), {
        'metrics.totalWatchTime': increment(metrics.watchTime),
        'metrics.skips': increment(metrics.skips),
        'metrics.replays': increment(metrics.replays)
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      console.error("Failed to sync metrics batch", err);
      // Re-queue failed items (simplified for snippet)
    }
  }
}

export const metricsQueue = new MetricsSyncQueue();
