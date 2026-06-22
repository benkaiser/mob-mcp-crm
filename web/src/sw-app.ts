/// <reference lib="webworker" />
/*
 * App-shell service worker for the Mob CRM Preact SPA.
 *
 * Scope: /app/ — this coexists with the EXISTING root-scoped push service
 * worker served by the server at /service-worker.js (which owns `push` +
 * `notificationclick` delivery). This SW deliberately does NOT register any
 * push/notification handlers, so it can never swallow push events or
 * notification clicks — those stay with the root SW.
 *
 * Responsibilities:
 *  - Precache the app shell (navigation fallback = index.html).
 *  - Serve built assets (/app/assets/*) cache-first (they are content-hashed,
 *    so they're immutable and safe to cache forever).
 *  - Serve /app/ navigations with a network-first strategy, falling back to the
 *    cached app shell when offline.
 *  - NEVER touch /web/api or /api requests (auth/mutations/push endpoints) —
 *    they are passed straight through to the network, never cached.
 */

// This file is built by Vite to dist-web/sw-app.js and has no imports, so it
// runs as a classic worker. The self-cast keeps TypeScript happy.
const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `mob-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `mob-assets-${CACHE_VERSION}`;

// The app shell entry point. Vite emits index.html at the output root, served
// at /app/ by the server's express.static + history fallback.
const APP_SHELL_URL = '/app/index.html';
const PRECACHE_URLS = ['/app/', APP_SHELL_URL, '/app/manifest.webmanifest'];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => undefined))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE && k.startsWith('mob-'))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => sw.clients.claim()),
  );
});

function isApiRequest(url: URL): boolean {
  // Never cache or intercept API/auth/push endpoints.
  return url.pathname.startsWith('/web/api') || url.pathname.startsWith('/api') || url.pathname.startsWith('/web/');
}

function isHashedAsset(url: URL): boolean {
  return url.pathname.startsWith('/app/assets/');
}

async function networkFirstShell(request: Request): Promise<Response> {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    // Cache the latest shell HTML under the canonical shell URL.
    if (fresh && fresh.ok) cache.put(APP_SHELL_URL, fresh.clone());
    return fresh;
  } catch {
    const cached = (await cache.match(APP_SHELL_URL)) ?? (await cache.match('/app/'));
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Offline', headers: { 'Content-Type': 'text/plain' } });
  }
}

async function cacheFirstAsset(request: Request): Promise<Response> {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok) cache.put(request, fresh.clone());
  return fresh;
}

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  // Pass API/auth/push requests straight through — never cache, never break.
  if (isApiRequest(url)) return;

  // Navigations (page loads within /app) → network-first, offline fallback.
  if (request.mode === 'navigate' && url.pathname.startsWith('/app')) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  // Hashed build assets → cache-first (immutable).
  if (isHashedAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  // Other same-origin /app GETs (icons, manifest) → stale-while-revalidate.
  if (url.pathname.startsWith('/app/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then((fresh) => {
            if (fresh && fresh.ok) cache.put(request, fresh.clone());
            return fresh;
          })
          .catch(() => cached);
        return cached ?? (await fetchPromise) ?? new Response('Offline', { status: 503 });
      })(),
    );
  }
});
