/**
 * useBlinks.ts
 * Fetches active (non-expired) Blinks from Firestore,
 * groups them by user, and marks seen/unseen state.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, updateDoc, arrayUnion, doc, serverTimestamp, deleteDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { Blink, UserBlinks, BlinkReaction, BlinkReply } from '../types/blink';

/** Returns only non-expired blinks grouped by user, current user first */
function groupByUser(blinks: Blink[], currentUserId: string): UserBlinks[] {
  const map = new Map<string, UserBlinks>();

  for (const blink of blinks) {
    if (!map.has(blink.userId)) {
      map.set(blink.userId, {
        userId: blink.userId,
        username: blink.username,
        userDisplayName: blink.userDisplayName,
        userProfileImage: blink.userProfileImage,
        blinks: [],
        hasUnseen: false,
      });
    }
    const entry = map.get(blink.userId)!;
    entry.blinks.push(blink);
    if (!blink.viewedBy.includes(currentUserId)) {
      entry.hasUnseen = true;
    }
  }

  // Sort blinks within each user by createdAt
  map.forEach(entry => {
    entry.blinks.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  });

  // Convert to array: current user first, then others with unseen first
  const entries = Array.from(map.values());
  const mine = entries.filter(e => e.userId === currentUserId);
  const others = entries.filter(e => e.userId !== currentUserId)
    .sort((a, b) => Number(b.hasUnseen) - Number(a.hasUnseen));

  return [...mine, ...others];
}

export function useBlinks() {
  const { user } = useAuth();
  const [grouped, setGrouped] = useState<UserBlinks[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const now = new Date().toISOString();
    const q = query(
      collection(db, 'blinks'),
      where('expiresAt', '>', now),
      orderBy('expiresAt', 'asc')
    );

    const unsub = onSnapshot(q, snap => {
      const blinks = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Blink[];
      setGrouped(groupByUser(blinks, user.uid));
      setLoading(false);
    }, err => {
      console.error('useBlinks:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user?.uid]);

  /** Mark a single Blink as viewed by current user */
  const markViewed = useCallback(async (blinkId: string) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'blinks', blinkId), {
        viewedBy: arrayUnion(user.uid),
        viewsCount: (grouped
          .flatMap(g => g.blinks)
          .find(b => b.id === blinkId)?.viewsCount ?? 0) + 1,
      });
    } catch (e) {
      // silent — non-critical
    }
  }, [user, grouped]);

  /** Send an emoji reaction */
  const sendReaction = useCallback(async (blinkId: string, emoji: string) => {
    if (!user) return;
    await addDoc(collection(db, 'blinks', blinkId, 'reactions'), {
      blinkId,
      userId: user.uid,
      username: user.username,
      userProfileImage: user.profileImage ?? null,
      emoji,
      createdAt: new Date().toISOString(),
    } satisfies Omit<BlinkReaction, 'id'>);
  }, [user]);

  /** Send a text reply to a Blink (creates a notification on the owner's side) */
  const sendReply = useCallback(async (blink: Blink, text: string) => {
    if (!user) return;
    const reply: Omit<BlinkReply, 'id'> = {
      blinkId: blink.id,
      blinkOwnerId: blink.userId,
      senderId: user.uid,
      senderUsername: user.username,
      senderProfileImage: user.profileImage ?? undefined,
      text,
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'blinks', blink.id, 'replies'), reply);

    // Also create a notification for the blink owner
    if (blink.userId !== user.uid) {
      await addDoc(collection(db, 'notifications'), {
        recipientId: blink.userId,
        senderId: user.uid,
        senderUsername: user.username,
        senderProfileImage: user.profileImage ?? null,
        type: 'blink_reply',
        blinkId: blink.id,
        text,
        read: false,
        createdAt: new Date().toISOString(),
      });
    }
  }, [user]);

  /** Delete own Blink */
  const deleteBlink = useCallback(async (blinkId: string) => {
    await deleteDoc(doc(db, 'blinks', blinkId));
  }, []);

  return { grouped, loading, markViewed, sendReaction, sendReply, deleteBlink };
}
