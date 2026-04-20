import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  onSnapshot,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const PAGE_SIZE = 15;

export function useInfiniteFeed<T>(collectionPath: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  // Track extra pages loaded beyond the first (pagination)
  const extraPagesRef = useRef<T[]>([]);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

  useEffect(() => {
    setLoading(true);
    extraPagesRef.current = [];

    // Live listener on the first page — new posts from real users and the
    // demo bot seeder appear automatically without a manual refresh.
    const q = query(
      collection(db, collectionPath),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const firstPage = snap.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
        lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
        setHasMore(snap.docs.length === PAGE_SIZE);
        // Merge live first page with any extra pages the user has scrolled into
        setData([...firstPage, ...extraPagesRef.current]);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching feed:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionPath]);

  const fetchMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastDocRef.current) return;
    setLoadingMore(true);
    try {
      const q = query(
        collection(db, collectionPath),
        orderBy('createdAt', 'desc'),
        startAfter(lastDocRef.current),
        limit(PAGE_SIZE)
      );
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? lastDocRef.current;
      extraPagesRef.current = [...extraPagesRef.current, ...items];
      setData(prev => [...prev, ...items]);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [collectionPath, loadingMore, hasMore]);

  return { data, loading, loadingMore, hasMore, fetchMore };
}
