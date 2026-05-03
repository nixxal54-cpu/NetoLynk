/**
 * NetoLynk Analytics — Cloud Functions additions
 * ─────────────────────────────────────────────────────────────────
 * ADD these exports to your existing functions/src/index.ts
 *
 * New Firestore collections created:
 *   /analytics_events/{eventId}   — raw event log
 *   /analytics_daily/{YYYY-MM-DD} — daily roll-ups
 *   /analytics_presence/{userId}  — online presence
 */

import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

// admin.initializeApp() — already in your index.ts, don't duplicate
const db = admin.firestore();

// ─── Aggregate: Active users in last 5 minutes ────────────────────────────────
// Called by the dashboard to get a real server-side active count.
// Presence documents are written by the client updatePresence() helper.

export const getActiveUsersCount = functions.https.onCall(async () => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const snap = await db
    .collection('analytics_presence')
    .where('online', '==', true)
    .where('lastSeen', '>=', admin.firestore.Timestamp.fromDate(fiveMinAgo))
    .count()
    .get();
  return { count: snap.data().count };
});

// ─── Roll-up: Daily stats snapshot ────────────────────────────────────────────
// Runs at midnight IST (UTC+5:30 = 18:30 UTC previous day)
// Writes a clean summary doc to /analytics_daily/{YYYY-MM-DD}/summary

export const dailyStatsRollup = functions.scheduler.onSchedule(
  { schedule: '30 18 * * *', timeZone: 'UTC' },
  async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Count new users created today
    const dayStart = new Date(today + 'T00:00:00.000Z');
    const dayEnd   = new Date(today + 'T23:59:59.999Z');

    const [newUsersSnap, newPostsSnap, totalUsersSnap] = await Promise.all([
      db.collection('users')
        .where('createdAt', '>=', dayStart.toISOString())
        .where('createdAt', '<=', dayEnd.toISOString())
        .count().get(),
      db.collection('posts')
        .where('createdAt', '>=', dayStart.toISOString())
        .where('createdAt', '<=', dayEnd.toISOString())
        .count().get(),
      db.collection('users').count().get(),
    ]);

    await db.doc(`analytics_daily/${today}`).set(
      {
        date: today,
        new_users: newUsersSnap.data().count,
        new_posts: newPostsSnap.data().count,
        total_users: totalUsersSnap.data().count,
        computed_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
);

// ─── Alert: Negative feedback surge ──────────────────────────────────────────
// Triggers when a new review with 1-2 stars is created.
// Extend with email / Slack webhook as needed.

export const onLowReviewCreated = functions.firestore.onDocumentCreated(
  'reviews/{reviewId}',
  async (event) => {
    const data = event.data?.data();
    if (!data || data.stars > 2) return;

    // Write alert to /analytics_alerts
    await db.collection('analytics_alerts').add({
      type: 'negative_review',
      severity: data.stars === 1 ? 'high' : 'medium',
      reviewId: event.params.reviewId,
      username: data.username,
      stars: data.stars,
      category: data.category || 'General',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      resolved: false,
    });
  }
);

// ─── Presence cleanup — mark stale presence as offline ───────────────────────
// Runs every 10 minutes

export const presenceCleanup = functions.scheduler.onSchedule(
  { schedule: 'every 10 minutes' },
  async () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
    const stale = await db
      .collection('analytics_presence')
      .where('online', '==', true)
      .where('lastSeen', '<', admin.firestore.Timestamp.fromDate(tenMinAgo))
      .get();

    const batch = db.batch();
    stale.docs.forEach((d) => {
      batch.update(d.ref, { online: false });
    });
    await batch.commit();
  }
);
