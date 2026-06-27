// src/hooks/usePushNotifications.ts
import { useEffect } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export const usePushNotifications = () => {
  useEffect(() => {
    const setupMessaging = async () => {
      try {
        // FIX 1: `Notification` is undefined in environments that don't support it
        // (some browsers, iOS Safari PWA shell, SSR-like contexts).
        // Guard before touching it — never call requestPermission blindly.
        if (typeof Notification === 'undefined') return;

        // FIX 2: Don't spam the user with a permission prompt on every load.
        // Only request if it's still undecided ('default'). If already
        // 'granted' we still grab the token; if 'denied' we bail silently.
        if (Notification.permission === 'denied') return;

        const messaging = getMessaging();

        let permission = Notification.permission;
        if (permission === 'default') {
          permission = await Notification.requestPermission();
        }

        if (permission === 'granted') {
          const token = await getToken(messaging, {
            vapidKey:
              'BCdHAuduL_vuZ_rqN-KDXYGz8BS9KZpUmz3R2pwOBagXvTxudYYi-A0iBneAhQpw9f2gdz4LLxh26zbO8SmJWgw',
          });

          if (token && auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              fcmToken: token,
            });
          }
        }
      } catch (err) {
        // Log but never crash the app — push notifications are optional
        console.warn('Push notification setup skipped:', err);
      }
    };

    setupMessaging();
  }, []);
};
