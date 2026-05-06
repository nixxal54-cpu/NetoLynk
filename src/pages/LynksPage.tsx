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

// 🚀 YOUR STRATEGIC FEED (FIXED VERSION)
function buildStrategicFeed(allLynks: any[], seenIds: Set<string>) {
  const unseen = allLynks.filter(l => !seenIds.has(l.id));

  const scored = unseen.map(l => ({ ...l, score: calculateLynkScore(l) }));
  scored.sort((a, b) => b.score - a.score);

  const preferredCats = interactionTracker.getPreferred();

  const highQuality = scored.filter(
    l => preferredCats.includes(l.category) && l.score > 20
  );

  const newCreators = scored.filter(l => l.boostScore > 50);

  const discovery = shuffle(scored);

  const usedIds = new Set<string>();
  const feed: any[] = [];

  const pushUnique = (item: any | undefined) => {
    if (!item || usedIds.has(item.id)) return;
    usedIds.add(item.id);
    feed.push(item);
  };

  // 🔥 HOOK (first 4)
  pushUnique(highQuality.shift()); // 0
  pushUnique(highQuality.shift()); // 1
  pushUnique(discovery.shift());   // 2
  pushUnique(newCreators.shift()); // 3

  // 🎯 Fill remaining (target = 10)
  while (feed.length < 10) {
    if (highQuality.length) pushUnique(highQuality.shift());
    if (feed.length >= 10) break;

    if (newCreators.length) pushUnique(newCreators.shift());
    if (feed.length >= 10) break;

    if (discovery.length) pushUnique(discovery.shift());
    if (feed.length >= 10) break;

    // fallback (in case all pools empty)
    const fallback = scored.find(l => !usedIds.has(l.id));
    if (!fallback) break;
    pushUnique(fallback);
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

      // 🔥 Use your strategic feed
      const newBatch = buildStrategicFeed(allLynks, seenIds.current);

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
        const isNearby = Math.abs(index - activeIndex) <= 1;

        return (
          <div
            key={lynk.id}
            ref={onRefChange}
            data-index={index}
            className="w-full h-full snap-start"
          >
            {isNearby ? (
              <LynkPlayer lynk={lynk} isActive={activeIndex === index} />
            ) : (
              <div className="w-full h-full bg-black" />
            )}
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
