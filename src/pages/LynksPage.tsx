// src/pages/LynksPage.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lynk } from '../types/lynk';
import { buildMixedFeed } from '../lib/lynkRecommendation';
import { LynkPlayer } from '../components/Lynks/LynkPlayer';

export default function LynksPage() {
  const [feed, setFeed] = useState<Lynk[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const seenIds = useRef<Set<string>>(new Set());

  // Intersection Observer for scroll snapping active video
  const observer = useRef<IntersectionObserver | null>(null);

  const fetchBatch = useCallback(async () => {
    // In production, this queries your backend or Firestore for the latest pool
    const q = query(collection(db, 'lynks'), limit(50));
    const snap = await getDocs(q);
    const allLynks = snap.docs.map(d => ({ id: d.id, ...d.data() }) as Lynk);
    
    const newBatch = buildMixedFeed(allLynks, seenIds.current);
    newBatch.forEach(l => seenIds.current.add(l.id));
    setFeed(prev => [...prev, ...newBatch]);
  }, []);

  useEffect(() => {
    fetchBatch();
  },[fetchBatch]);

  const onRefChange = useCallback((node: HTMLDivElement | null, index: number) => {
    if (node && observer.current) observer.current.observe(node);
  },[]);

  useEffect(() => {
    observer.current = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = Number(entry.target.getAttribute('data-index'));
          setActiveIndex(idx);
          
          // Preload next batch if we are near the end
          if (idx >= feed.length - 3) fetchBatch();
        }
      });
    }, { threshold: 0.6 });

    return () => observer.current?.disconnect();
  }, [feed.length, fetchBatch]);

  return (
    <div className="h-[100dvh] w-full bg-black overflow-y-scroll snap-y snap-mandatory scrollbar-hide">
      {feed.map((lynk, index) => {
        // Smart loading: only render DOM nodes for active +/- 1 video
        const isNearby = Math.abs(index - activeIndex) <= 1;

        return (
          <div 
            key={lynk.id} 
            ref={(node) => onRefChange(node, index)}
            data-index={index}
            className="w-full h-full snap-start"
          >
            {isNearby ? (
              <LynkPlayer lynk={lynk} isActive={activeIndex === index} />
            ) : (
              <div className="w-full h-full bg-black" /> // Placeholder to maintain scroll height
            )}
          </div>
        );
      })}
    </div>
  );
}
