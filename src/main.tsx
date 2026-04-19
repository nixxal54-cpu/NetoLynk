import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App.tsx';
import './index.css';

// ---------------------------------------------------------------------------
// Error tracking — Sentry
// Replace the dsn value with your project DSN from sentry.io.
// Set VITE_SENTRY_DSN in your .env file; leave blank to disable in dev.
// ---------------------------------------------------------------------------
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN ?? '',
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  integrations: [Sentry.browserTracingIntegration()],
  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,
  // Only send errors from your own domain
  allowUrls: [/netolynk\.app/],
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('ServiceWorker registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
