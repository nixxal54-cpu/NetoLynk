import { useEffect } from 'react';
import { getMessaging, getToken } from 'firebase/messaging';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

export const usePushNotifications = () => {
  useEffect(() => {
    const setupMessaging = async () => {
      try {
        const messaging = getMessaging();
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
          // Using the VAPID Key you provided
          const token = await getToken(messaging, {
            vapidKey: 'BCdHAuduL_vuZ_rqN-KDXYGz8BS9KZpUmz3R2pwOBagXvTxudYYi-A0iBneAhQpw9f2gdz4LLxh26zbO8SmJWgw'
          });

          if (token && auth.currentUser) {
            await updateDoc(doc(db, 'users', auth.currentUser.uid), {
              fcmToken: token 
            });
          }
        }
      } catch (err) {
        console.error("Push Notification setup failed:", err);
      }
    };

    setupMessaging();
  }, []);
};
