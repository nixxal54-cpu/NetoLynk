/**
 * useLynkFeed.ts
 * Manages paginated, ranked Lynks feed with prefetch support.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { Lynk, FeedType } from '../types/lynk';
import {
  fetchForYouBatch,
  fetchFollowingFeed,
  fetchTrendingFeed,
} from '../lib/lynkService';
import { rankFeed, sessionHistory } from '../lib/lynkRecommendation';
import { useAuth } from '../context/AuthContext';

const BATCH = 15;

export function useLynkFeed(feedType: FeedType) {
  const { user } = useAuth();
  const [lynks, setLynks]         = useState<Lynk[]>([]);
  const [loading, setLoading]     = useState(false);
  const [hasMore, setHasMore]     = useState(true);
  const lastDocRef                = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const followingUids             = (user as any)?.following ?? [];

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      let raw: Lynk[] = [];
      let newLastDoc: QueryDocumentSnapshot<DocumentData> | null = null;

      if (feedType === 'forYou') {
        const res = await fetchForYouBatch(lastDocRef.current ?? undefined, BATCH);
        raw = res.lynks;
        newLastDoc = res.lastDoc;
      } else if (feedType === 'following') {
        const res = await fetchFollowingFeed(followingUids, lastDocRef.current ?? undefined, BATCH);
        raw = res.lynks;
        newLastDoc = res.lastDoc;
      } else {
        const res = await fetchTrendingFeed(lastDocRef.current ?? undefined, BATCH);
        raw = res.lynks;
        newLastDoc = res.lastDoc;
      }

      lastDocRef.current = newLastDoc;
      if (!newLastDoc || raw.length < BATCH) setHasMore(false);

      // Rank for "for you", chronological for others
      const ranked = feedType === 'forYou'
        ? rankFeed(raw, sessionHistory.seenIds, sessionHistory.likedIds)
        : raw;

      setLynks((prev) => {
        const ids = new Set(prev.map((l) => l.id));
        return [...prev, ...ranked.filter((l) => !ids.has(l.id))];
      });
    } catch (e) {
      console.error('useLynkFeed error:', e);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, feedType, followingUids]);

  // Load initial batch
  useEffect(() => {
    setLynks([]);
    setHasMore(true);
    lastDocRef.current = null;
    loadMore();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedType]);

  return { lynks, loading, hasMore, loadMore };
}
