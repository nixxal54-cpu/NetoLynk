// src/pages/LynksPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  getDocs,
  limit,
  query,
  orderBy,
  startAfter,
  DocumentData,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lynk } from '../types/lynk';
import { LynkPlayer } from '../components/Lynks/LynkPlayer';

// 🔥 Mocked helpers (replace with real ones later)
const interactionTracker = {
  getPreferred: () => ['gaming', 'funny']
};

function calculateLynkScore(l: any) {
  return (
    (l.metrics?.likes || 0) * 2 +
    (l.metrics?.shares || 0) * 3 +
    (l.metrics?.totalWatchTime || 0) * 0.01 +
    (l.boostScore || 0)
  );
}

// 🔥 Improved shuffle (Fisher-Yates)
function shuffle(array: any[]) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 🚀 STRATEGIC FEED
// Shows all visible public videos — new uploads always appear.
// Scoring weights engagement but never hides zero-engagement videos.
function buildStrategicFeed(allLynks: any[], seenIds: Set<string>) {
  // Filter: unseen + not hidden + public
  const unseen = allLynks.filter(l =>
    !seenIds.has(l.id) &&
    l.isHidden !== true &&
    (l.visibility === 'public' || l.visibility === undefined)
  );

  if (unseen.length === 0) return [];

  // Score every video — new videos with 0 engagement still get boostScore
  const scored = unseen.map(l => ({ ...l, score: calculateLynkScore(l) }));

  // Split into boosted (new uploads) and the rest
  const boosted  = scored.filter(l => (l.boostScore || 0) > 0).sort((a, b) => b.boostScore - a.boostScore);
  const rest     = scored.filter(l => (l.boostScore || 0) === 0).sort((a, b) => b.score - a.score);
  const shuffled = shuffle([...boosted, ...rest]);

  // Deduplicate and return all (no arbitrary 10-item cap on small feeds)
  const usedIds = new Set<string>();
  const feed: any[] = [];

  for (const item of shuffled) {
    if (!usedIds.has(item.id)) {
      usedIds.add(item.id);
      feed.push(item);
    }
  }

  return feed;
}

export default function LynksPage() {
  const [feed, setFeed] = useState<Lynk[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  const seenIds = useRef<Set<string>>(new Set());

  const lastDocRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const isFetching = useRef(false);
  const hasMore = useRef(true);

  const observer = useRef<IntersectionObserver | null>(null);

  // 🚀 Fetch batch
  const fetchBatch = useCallback(async () => {
    if (isFetching.current || !hasMore.current) return;

    isFetching.current = true;

    try {
      let q;

      if (lastDocRef.current) {
        q = query(
          collection(db, 'lynks'),
          orderBy('createdAt', 'desc'),
          startAfter(lastDocRef.current),
          limit(20)
        );
      } else {
        q = query(
          collection(db, 'lynks'),
          orderBy('createdAt', 'desc'),
          limit(20)
        );
      }

      const snap = await getDocs(q);

      if (snap.empty) {
        hasMore.current = false;
        return;
      }

      lastDocRef.current = snap.docs[snap.docs.length - 1];

      const allLynks = snap.docs.map(
        d => ({ id: d.id, ...d.data() }) as Lynk
      );

      // Debug: log what Firestore returned
      console.log('[LynksPage] Fetched from Firestore:', allLynks.length, 'docs', allLynks.map(l => ({ id: l.id, visibility: l.visibility, isHidden: l.isHidden, videoId: l.videoId })));

      // 🔥 Use your strategic feed
      const newBatch = buildStrategicFeed(allLynks, seenIds.current);
      console.log('[LynksPage] After feed filter:', newBatch.length, 'videos');

      newBatch.forEach(l => seenIds.current.add(l.id));

      setFeed(prev => [...prev, ...newBatch]);

    } catch (err) {
      console.error('Fetch failed', err);
    } finally {
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  // ✅ Stable observer
  useEffect(() => {
    observer.current = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = Number(entry.target.getAttribute('data-index'));
            setActiveIndex(idx);

            if (idx >= feed.length - 3) {
              fetchBatch();
            }
          }
        });
      },
      { threshold: 0.6 }
    );

    return () => observer.current?.disconnect();
  }, [fetchBatch, feed.length]);

  const onRefChange = useCallback((node: HTMLDivElement | null) => {
    if (node && observer.current) {
      observer.current.observe(node);
    }
  }, []);

  return (
    <div className="h-[100dvh] w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
      {feed.map((lynk, index) => {
        // Only mount ±1 from active to save memory
        // But only the exact active index gets isActive=true → plays audio
        const isNearby  = Math.abs(index - activeIndex) <= 1;
        const isActive  = index === activeIndex;

        return (
          <div
            key={lynk.id}
            ref={onRefChange}
            data-index={index}
            className="w-full h-full snap-start"
          >
            {isNearby
              ? <LynkPlayer lynk={lynk} isActive={isActive} />
              : <div className="w-full h-full bg-black" />
            }
          </div>
        );
      })}

      {isFetching.current && (
        <div className="text-white text-center py-4">
          Loading more...
        </div>
      )}
    </div>
  );
}
