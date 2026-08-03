import { render } from 'preact';
import { App } from './app';
import { initThemeWatcher } from './store/theme';
import './ui/styles.css';

// Keep the resolved theme in sync with the OS while the preference is 'system'.
// (The initial data-theme was already applied pre-paint by the boot script in
// index.html, so this only handles live OS changes.)
initThemeWatcher();

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}

// Register the app-shell service worker (scope /app/) for offline support.
// This is separate from the root-scoped push SW at /service-worker.js, which
// the push store registers when the user enables notifications - different
// URLs and scopes mean the two registrations never conflict.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw-app.js', { scope: '/app/' }).catch(() => {
      // Service worker registration is best-effort; the SPA works without it.
    });
  });
}
