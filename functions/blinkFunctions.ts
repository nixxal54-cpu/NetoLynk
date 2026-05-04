/**
 * blinkFunctions.ts
 * Add these Cloud Functions to your existing functions/src/index.ts
 *
 * - cleanExpiredBlinks: Scheduled every hour — deletes expired blinks + their sub-collections
 * - onBlinkCreated: Notifies followers when a new Blink is posted
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const storage = admin.storage();

// ── 1. Scheduled cleanup: runs every hour ─────────────────────────────────────
export const cleanExpiredBlinks = functions.scheduler
  .every(60)
  .onRun(async () => {
    const now = new Date().toISOString();

    const expired = await db
      .collection('blinks')
      .where('expiresAt', '<=', now)
      .limit(200) // process in batches to avoid timeout
      .get();

    if (expired.empty) return null;

    const batch = db.batch();

    for (const doc of expired.docs) {
      const data = doc.data();

      // Delete media from Storage
      try {
        const url: string = data.mediaUrl;
        if (url) {
          // Extract storage path from download URL
          const match = url.match(/\/o\/(.+?)\?/);
          if (match) {
            const path = decodeURIComponent(match[1]);
            await storage.bucket().file(path).delete();
          }
        }
      } catch (e) {
        // Media may already be gone — continue
      }

      // Delete sub-collections
      const [reactions, replies] = await Promise.all([
        doc.ref.collection('reactions').get(),
        doc.ref.collection('replies').get(),
      ]);
      reactions.forEach(r => batch.delete(r.ref));
      replies.forEach(r => batch.delete(r.ref));

      // Delete blink document
      batch.delete(doc.ref);
    }

    await batch.commit();
    console.log(`cleanExpiredBlinks: deleted ${expired.size} blinks`);
    return null;
  });

// ── 2. On Blink created — notify followers ────────────────────────────────────
export const onBlinkCreated = functions.firestore
  .document('blinks/{blinkId}')
  .onCreate(async (snap, context) => {
    const blink = snap.data();
    if (!blink) return;

    // Get creator's followers
    const creatorDoc = await db.collection('users').doc(blink.userId).get();
    const followers: string[] = creatorDoc.data()?.followers ?? [];

    if (followers.length === 0) return;

    // Batch-write notifications (max 500 per Firestore batch)
    const CHUNK = 400;
    for (let i = 0; i < followers.length; i += CHUNK) {
      const chunk = followers.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const followerId of chunk) {
        const ref = db.collection('notifications').doc();
        batch.set(ref, {
          recipientId: followerId,
          senderId: blink.userId,
          senderUsername: blink.username,
          senderProfileImage: blink.userProfileImage ?? null,
          type: 'new_blink',
          blinkId: context.params.blinkId,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }
      await batch.commit();
    }
  });
