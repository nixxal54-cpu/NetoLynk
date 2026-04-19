import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  getDocs,
  DocumentSnapshot,
  QueryDocumentSnapshot
} from 'firebase/firestore';
import { db } from '../lib/firebase';

const PAGE_SIZE = 15;

export function useInfiniteFeed<T>(collectionPath: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastDocRef = useRef<QueryDocumentSnapshot | null>(null);

  const fetchFirst = useCallback(async () => {
    setLoading(true);
    try {
      const q = query(collection(db, collectionPath), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
      const snap = await getDocs(q);
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() })) as T[];
      lastDocRef.current = snap.docs[snap.docs.length - 1] ?? null;
      setData(items);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error fetching feed:', err);
    } finally {
      setLoading(false);
    }
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
      setData(prev => [...prev, ...items]);
      setHasMore(snap.docs.length === PAGE_SIZE);
    } catch (err) {
      console.error('Error loading more:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [collectionPath, loadingMore, hasMore]);

  useEffect(() => { fetchFirst(); }, [fetchFirst]);

  return { data, loading, loadingMore, hasMore, fetchMore };
}
