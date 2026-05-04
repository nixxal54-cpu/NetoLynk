/**
 * lynkService.ts
 * All Firestore operations for the Lynks feature.
 * Collections: lynks | lynkLikes | lynkComments | lynkViews | watchTimeLogs
 */
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  serverTimestamp,
  writeBatch,
  onSnapshot,
  QueryDocumentSnapshot,
  DocumentData,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Lynk, LynkComment, LynkView } from '../types/lynk';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const lynksCol = () => collection(db, 'lynks');
const likesCol = () => collection(db, 'lynkLikes');
const commentsCol = () => collection(db, 'lynkComments');
const viewsCol = () => collection(db, 'lynkViews');
const watchCol = () => collection(db, 'watchTimeLogs');

function docToLynk(d: QueryDocumentSnapshot<DocumentData>): Lynk {
  return { ...d.data(), id: d.id } as Lynk;
}

// ─── Feed queries ─────────────────────────────────────────────────────────────

/** FOR YOU — fetch a batch for scoring client-side */
export async function fetchForYouBatch(
  lastDoc?: QueryDocumentSnapshot<DocumentData>,
  batchSize = 20
): Promise<{ lynks: Lynk[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  let q = query(
    lynksCol(),
    where('isHidden', '==', false),
    orderBy('createdAt', 'desc'),
    limit(batchSize)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));

  const snap = await getDocs(q);
  return {
    lynks: snap.docs.map(docToLynk),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

/** FOLLOWING — videos from accounts the user follows */
export async function fetchFollowingFeed(
  followingUids: string[],
  lastDoc?: QueryDocumentSnapshot<DocumentData>,
  batchSize = 20
): Promise<{ lynks: Lynk[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  if (!followingUids.length) return { lynks: [], lastDoc: null };
  const uidsToQuery = followingUids.slice(0, 10); // Firestore 'in' limit
  let q = query(
    lynksCol(),
    where('userId', 'in', uidsToQuery),
    where('isHidden', '==', false),
    orderBy('createdAt', 'desc'),
    limit(batchSize)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  const snap = await getDocs(q);
  return {
    lynks: snap.docs.map(docToLynk),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

/** TRENDING — sorted by viewsCount descending */
export async function fetchTrendingFeed(
  lastDoc?: QueryDocumentSnapshot<DocumentData>,
  batchSize = 20
): Promise<{ lynks: Lynk[]; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
  let q = query(
    lynksCol(),
    where('isHidden', '==', false),
    where('isTrending', '==', true),
    orderBy('viewsCount', 'desc'),
    limit(batchSize)
  );
  if (lastDoc) q = query(q, startAfter(lastDoc));
  const snap = await getDocs(q);
  return {
    lynks: snap.docs.map(docToLynk),
    lastDoc: snap.docs[snap.docs.length - 1] ?? null,
  };
}

/** Fetch chain replies for a given Lynk */
export async function fetchChainReplies(parentLynkId: string): Promise<Lynk[]> {
  const snap = await getDocs(
    query(lynksCol(), where('parentLynkId', '==', parentLynkId), orderBy('createdAt', 'asc'), limit(30))
  );
  return snap.docs.map(docToLynk);
}

/** Fetch Lynks by hashtag */
export async function fetchByHashtag(tag: string, batchSize = 20): Promise<Lynk[]> {
  const snap = await getDocs(
    query(lynksCol(), where('hashtags', 'array-contains', tag.toLowerCase()), where('isHidden', '==', false), orderBy('viewsCount', 'desc'), limit(batchSize))
  );
  return snap.docs.map(docToLynk);
}

/** Fetch a single Lynk */
export async function fetchLynk(lynkId: string): Promise<Lynk | null> {
  const d = await getDoc(doc(db, 'lynks', lynkId));
  return d.exists() ? ({ ...d.data(), id: d.id } as Lynk) : null;
}

/** Fetch user's own Lynks for profile grid */
export async function fetchUserLynks(userId: string): Promise<Lynk[]> {
  const snap = await getDocs(
    query(lynksCol(), where('userId', '==', userId), where('isHidden', '==', false), orderBy('createdAt', 'desc'), limit(60))
  );
  return snap.docs.map(docToLynk);
}

// ─── Write operations ─────────────────────────────────────────────────────────

export async function createLynk(data: Omit<Lynk, 'id'>): Promise<string> {
  const ref = await addDoc(lynksCol(), {
    ...data,
    createdAt: new Date().toISOString(),
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    savesCount: 0,
    totalWatchSeconds: 0,
    completionRate: 0,
    reportCount: 0,
    isHidden: false,
    isTrending: false,
    // Viral boost: new Lynks get 24h boost window
    boostExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  return ref.id;
}

export async function deleteLynk(lynkId: string): Promise<void> {
  await updateDoc(doc(db, 'lynks', lynkId), { isHidden: true });
}

// ─── Like / Unlike ────────────────────────────────────────────────────────────

export async function toggleLynkLike(
  lynkId: string,
  userId: string,
  liked: boolean
): Promise<void> {
  const batch = writeBatch(db);
  const likeId = `${lynkId}_${userId}`;
  const likeRef = doc(db, 'lynkLikes', likeId);
  const lynkRef = doc(db, 'lynks', lynkId);

  if (liked) {
    // Unlike
    batch.delete(likeRef);
    batch.update(lynkRef, { likesCount: increment(-1) });
  } else {
    // Like
    batch.set(likeRef, { lynkId, userId, createdAt: new Date().toISOString() });
    batch.update(lynkRef, { likesCount: increment(1) });
  }
  await batch.commit();
}

export async function isLynkLiked(lynkId: string, userId: string): Promise<boolean> {
  const d = await getDoc(doc(db, 'lynkLikes', `${lynkId}_${userId}`));
  return d.exists();
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export function subscribeToLynkComments(
  lynkId: string,
  cb: (comments: LynkComment[]) => void
) {
  const q = query(commentsCol(), where('lynkId', '==', lynkId), orderBy('createdAt', 'asc'), limit(100));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ ...d.data(), id: d.id } as LynkComment)));
  });
}

export async function addLynkComment(
  lynkId: string,
  userId: string,
  username: string,
  userProfileImage: string | undefined,
  text: string
): Promise<void> {
  const batch = writeBatch(db);
  const commentRef = doc(commentsCol());
  batch.set(commentRef, {
    lynkId, userId, username, userProfileImage: userProfileImage ?? null,
    text, createdAt: new Date().toISOString(),
  });
  batch.update(doc(db, 'lynks', lynkId), { commentsCount: increment(1) });
  await batch.commit();
}

// ─── View & Watch Time ────────────────────────────────────────────────────────

export async function recordLynkView(
  lynkId: string,
  userId: string,
  watchedSeconds: number,
  duration: number
): Promise<void> {
  const viewId = `${lynkId}_${userId}`;
  const viewRef = doc(db, 'lynkViews', viewId);
  const existing = await getDoc(viewRef);
  const completed = watchedSeconds / duration >= 0.8;

  const batch = writeBatch(db);

  if (!existing.exists()) {
    batch.set(viewRef, {
      lynkId, userId, watchedSeconds, completed,
      createdAt: new Date().toISOString(),
    });
    batch.update(doc(db, 'lynks', lynkId), { viewsCount: increment(1) });
  } else {
    batch.update(viewRef, { watchedSeconds: Math.max(existing.data().watchedSeconds, watchedSeconds), completed });
  }

  // Always log watch time for analytics
  const logRef = doc(watchCol());
  batch.set(logRef, {
    lynkId, userId, sessionSeconds: watchedSeconds,
    createdAt: new Date().toISOString(),
  });

  // Update aggregate watch time + completion rate on the lynk
  batch.update(doc(db, 'lynks', lynkId), {
    totalWatchSeconds: increment(watchedSeconds),
  });

  await batch.commit();
}

// ─── Share ────────────────────────────────────────────────────────────────────

export async function incrementLynkShare(lynkId: string): Promise<void> {
  await updateDoc(doc(db, 'lynks', lynkId), { sharesCount: increment(1) });
}

// ─── Save / Bookmark ──────────────────────────────────────────────────────────

export async function toggleLynkSave(
  lynkId: string,
  userId: string,
  saved: boolean
): Promise<void> {
  const saveId = `${lynkId}_${userId}`;
  const saveRef = doc(db, 'lynkSaves', saveId);
  const lynkRef = doc(db, 'lynks', lynkId);
  const batch = writeBatch(db);
  if (saved) {
    batch.delete(saveRef);
    batch.update(lynkRef, { savesCount: increment(-1) });
  } else {
    batch.set(saveRef, { lynkId, userId, createdAt: new Date().toISOString() });
    batch.update(lynkRef, { savesCount: increment(1) });
  }
  await batch.commit();
}

export async function isLynkSaved(lynkId: string, userId: string): Promise<boolean> {
  const d = await getDoc(doc(db, 'lynkSaves', `${lynkId}_${userId}`));
  return d.exists();
}

// ─── Report ───────────────────────────────────────────────────────────────────

export async function reportLynk(lynkId: string, userId: string, reason: string): Promise<void> {
  await addDoc(collection(db, 'lynkReports'), {
    lynkId, userId, reason, createdAt: new Date().toISOString(),
  });
  const lynkRef = doc(db, 'lynks', lynkId);
  await updateDoc(lynkRef, { reportCount: increment(1) });
  // Auto-hide if > 5 reports
  const snap = await getDoc(lynkRef);
  if (snap.exists() && (snap.data().reportCount ?? 0) >= 5) {
    await updateDoc(lynkRef, { isHidden: true });
  }
}

// ─── Trending update (called after engagement events) ─────────────────────────
export async function maybeMarkTrending(lynk: Lynk): Promise<void> {
  const isTrending = lynk.viewsCount > 500 || lynk.likesCount > 100;
  if (isTrending !== lynk.isTrending) {
    await updateDoc(doc(db, 'lynks', lynk.id), { isTrending });
  }
}
