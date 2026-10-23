// Give the service worker access to Firebase Messaging.
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
firebase.initializeApp({
  apiKey: "AIzaSyBf7GSp6uIxYNKXeII509jKykMa6TxmrsI",
  authDomain: "netolynk.firebaseapp.com",
  projectId: "netolynk",
  storageBucket: "netolynk.firebasestorage.app",
  messagingSenderId: "1071239467325",
  appId: "1:1071239467325:web:b02ec55aa0165ead32f554"
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
