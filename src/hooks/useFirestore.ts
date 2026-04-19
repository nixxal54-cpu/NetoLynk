import { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, QueryConstraint } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useCollection<T>(
  collectionPath: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // FIX: Track previous path so we only wipe data when switching to a DIFFERENT collection.
  // Previously, every re-render reset data to [] causing messages to flash blank on chat switch.
  const prevPathRef = useRef<string>('');

  useEffect(() => {
    if (!collectionPath || collectionPath === 'null') {
      setData([]); setLoading(false); prevPathRef.current = ''; return;
    }

    // Only blank out data when navigating to a different collection
    if (prevPathRef.current !== collectionPath) {
      setData([]);
      prevPathRef.current = collectionPath;
    }
    setLoading(true);
    setError(null);

    const q = query(collection(db, collectionPath), ...constraints);
    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        setData(snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as T[]);
        setLoading(false);
      },
      (err) => {
        console.error(`useCollection (${collectionPath}):`, err);
        setError(err as Error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, ...deps]);

  return { data, loading, error };
}
