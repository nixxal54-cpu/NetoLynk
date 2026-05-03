/**
 * NetoLynk Analytics — Event Tracking System
 * ─────────────────────────────────────────────────────────────────
 * Drop-in module. Import trackEvent() anywhere in the app.
 * Writes to /analytics_events with batching + debounce protection.
 * No external SDK — pure Firestore.
 */

import {
  collection,
  addDoc,
  serverTimestamp,
  writeBatch,
  doc,
  increment,
  setDoc,
} from 'firebase/firestore';
import { db } from './firebase';

// ─── Event Catalog ───────────────────────────────────────────────────────────

export type EventName =
  // Auth / Session
  | 'user_signup'
  | 'user_login'
  | 'session_start'
  | 'session_end'
  // Content
  | 'post_created'
  | 'post_viewed'
  | 'post_liked'
  | 'post_unliked'
  | 'post_shared'
  | 'post_saved'
  | 'comment_added'
  // Social
  | 'user_followed'
  | 'user_unfollowed'
  | 'message_sent'
  | 'chat_opened'
  // Navigation
  | 'page_viewed'
  | 'feed_tab_changed'
  // Review / Feedback
  | 'review_submitted'
  | 'support_form_opened'
  | 'support_submitted'
  // AI
  | 'netoai_opened'
  | 'netoai_message_sent'
  // Explore
  | 'search_performed'
  | 'explore_viewed'
  // Onboarding
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'onboarding_skipped';

export interface AnalyticsEvent {
  event: EventName;
  userId: string;
  sessionId: string;
  timestamp: ReturnType<typeof serverTimestamp>;
  meta?: Record<string, string | number | boolean | null>;
}

// ─── Session Management ───────────────────────────────────────────────────────

let _sessionId: string | null = null;
let _sessionStart: number | null = null;

export function getOrCreateSessionId(): string {
  if (!_sessionId) {
    _sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    _sessionStart = Date.now();
  }
  return _sessionId;
}

export function endSession(userId: string) {
  if (!_sessionId || !_sessionStart) return;
  const duration = Math.round((Date.now() - _sessionStart) / 1000);
  trackEvent('session_end', userId, { duration_seconds: duration });
  _sessionId = null;
  _sessionStart = null;
}

// ─── Debounce Queue — prevents event spam ────────────────────────────────────

const _queue: AnalyticsEvent[] = [];
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_INTERVAL_MS = 3000;
const MAX_QUEUE_SIZE = 20;

async function flush() {
  if (_queue.length === 0) return;
  const batch = writeBatch(db);
  const events = _queue.splice(0, MAX_QUEUE_SIZE);

  events.forEach((ev) => {
    const ref = doc(collection(db, 'analytics_events'));
    batch.set(ref, ev);
  });

  // Update daily aggregates — /analytics_daily/{YYYY-MM-DD}
  const today = new Date().toISOString().slice(0, 10);
  const dailyRef = doc(db, 'analytics_daily', today);
  const counters: Record<string, ReturnType<typeof increment>> = {};
  events.forEach((ev) => {
    counters[`events.${ev.event}`] = increment(1);
    counters['events.total'] = increment(1);
  });
  batch.set(dailyRef, counters, { merge: true });

  try {
    await batch.commit();
  } catch (err) {
    // Silently fail — analytics must never break the app
    console.warn('[NetoLynk Analytics] flush failed:', err);
    // Re-queue if needed (max 1 retry)
    _queue.unshift(...events.slice(0, 5));
  }
}

function scheduleFlush() {
  if (_flushTimer) clearTimeout(_flushTimer);
  if (_queue.length >= MAX_QUEUE_SIZE) {
    flush();
    return;
  }
  _flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
}

// ─── Core Track Function ──────────────────────────────────────────────────────

const _dedupeMap = new Map<string, number>();

export function trackEvent(
  event: EventName,
  userId: string,
  meta?: Record<string, string | number | boolean | null>
) {
  if (!userId) return; // Never track anonymous events

  // Deduplicate identical events within 1 second
  const dedupeKey = `${userId}:${event}`;
  const now = Date.now();
  const last = _dedupeMap.get(dedupeKey);
  if (last && now - last < 1000) return;
  _dedupeMap.set(dedupeKey, now);
  if (_dedupeMap.size > 500) _dedupeMap.clear(); // prevent memory leak

  const ev: AnalyticsEvent = {
    event,
    userId,
    sessionId: getOrCreateSessionId(),
    timestamp: serverTimestamp(),
    ...(meta ? { meta } : {}),
  };

  _queue.push(ev);
  scheduleFlush();
}

// ─── Session Tracker (call in AuthContext) ────────────────────────────────────

export function initSessionTracking(userId: string) {
  getOrCreateSessionId();
  trackEvent('session_start', userId);

  // Flush on page hide (mobile background / tab close)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      endSession(userId);
      flush(); // attempt immediate flush
    } else if (document.visibilityState === 'visible') {
      trackEvent('session_start', userId);
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('beforeunload', () => endSession(userId));
}

// ─── Presence Tracker — updates /analytics_presence/{userId} ─────────────────
//     Powers the "Active users now" metric in the dashboard.

export async function updatePresence(userId: string, isOnline: boolean) {
  try {
    await setDoc(
      doc(db, 'analytics_presence', userId),
      {
        online: isOnline,
        lastSeen: serverTimestamp(),
        sessionId: getOrCreateSessionId(),
      },
      { merge: true }
    );
  } catch {
    // silent
  }
}
