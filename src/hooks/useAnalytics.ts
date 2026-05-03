/**
 * useAnalytics — React hook wrapping the analytics tracker.
 * Provides auto-session management tied to AuthContext.
 *
 * Usage:
 *   const { track } = useAnalytics();
 *   track('post_created', { type: 'image', tags_count: 3 });
 */

import { useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  trackEvent,
  initSessionTracking,
  updatePresence,
  EventName,
} from '../lib/analytics';

export function useAnalytics() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.uid) return;
    initSessionTracking(user.uid);
    updatePresence(user.uid, true);
    return () => {
      if (user?.uid) updatePresence(user.uid, false);
    };
  }, [user?.uid]);

  const track = useCallback(
    (event: EventName, meta?: Record<string, string | number | boolean | null>) => {
      if (!user?.uid) return;
      trackEvent(event, user.uid, meta);
    },
    [user?.uid]
  );

  return { track };
}
