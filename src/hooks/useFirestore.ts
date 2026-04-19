import { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  QueryConstraint
} from 'firebase/firestore';
import { db } from '../lib/firebase';

export function useCollection<T>(
  collectionPath: string,
  constraints: QueryConstraint[] = [],
  deps: unknown[] = []
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!collectionPath || collectionPath === 'null') {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(collection(db, collectionPath), ...constraints);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as T[];
      setData(items);
      setLoading(false);
    }, (err) => {
      console.error(`useCollection (${collectionPath}):`, err);
      setError(err as Error);
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionPath, ...deps]);

  return { data, loading, error };
}
