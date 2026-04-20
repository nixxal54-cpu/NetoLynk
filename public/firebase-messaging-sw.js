// Give the service worker access to Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyB-muBCB5Mx20KTmGD4gaq1PqJ5m274U8I",
  authDomain: "gen-lang-client-0694838337.firebaseapp.com",
  projectId: "gen-lang-client-0694838337",
  storageBucket: "gen-lang-client-0694838337.firebasestorage.app",
  messagingSenderId: "510564348591",
  appId: "1:510564348591:web:f3aa18de0a1a3f1c455a5a"
});

const messaging = firebase.messaging();

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new update.',
    icon: '/netolynk-logo.png', // Ensure this file exists in your public folder
    badge: '/netolynk-logo.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
