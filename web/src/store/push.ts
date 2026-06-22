import { signal } from '@preact/signals';

/*
 * Push notification store for the SPA.
 *
 * This talks to the EXISTING server push endpoints, which are NOT under
 * /web/api and DO NOT use the {data} envelope, so we use plain fetch with
 * credentials:'include' (session-cookie auth, no CSRF token required) rather
 * than the typed apiGet/apiPost client.
 *
 *   GET  /api/vapid-public-key      → { publicKey } | {}
 *   POST /api/push/subscribe        → { success, id }
 *   POST /api/push/unsubscribe      → { success }
 *   GET  /api/push/subscriptions    → { count }
 *
 * Actual push delivery + notification clicks are handled by the root-scoped
 * service worker at /service-worker.js (NOT the app-shell SW). We register
 * that root SW when subscribing, mirroring the old server-rendered push page.
 */

/** Whether this browser supports the Push API + service workers + Notification. */
export const pushSupported = signal<boolean>(
  typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window,
);

/** True once we've confirmed the server has VAPID configured. */
export const vapidAvailable = signal<boolean | null>(null);

/** Current Notification permission state ('default' | 'granted' | 'denied' | 'unsupported'). */
export const permission = signal<NotificationPermission | 'unsupported'>(
  typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
);

/** Whether THIS browser currently holds an active push subscription. */
export const subscribed = signal<boolean>(false);

/** Total push subscriptions for the account (from /api/push/subscriptions). */
export const subscriptionCount = signal<number | null>(null);

/** True while a subscribe/unsubscribe/load operation is in flight. */
export const pushBusy = signal<boolean>(false);

/** Last error message from a push operation, or null. */
export const pushError = signal<string | null>(null);

let vapidPublicKey: string | null = null;

/** Convert a base64url VAPID public key to the Uint8Array applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/** Read the current Notification permission into the signal. */
export function getPermissionState(): NotificationPermission | 'unsupported' {
  const p = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';
  permission.value = p;
  return p;
}

/** Fetch the VAPID public key from the server. Returns null if not configured. */
export async function loadVapidKey(): Promise<string | null> {
  if (!pushSupported.value) {
    vapidAvailable.value = false;
    return null;
  }
  try {
    const res = await fetch('/api/vapid-public-key', { credentials: 'include' });
    if (!res.ok) {
      vapidAvailable.value = false;
      return null;
    }
    const body = (await res.json()) as { publicKey?: string };
    if (body.publicKey) {
      vapidPublicKey = body.publicKey;
      vapidAvailable.value = true;
      return vapidPublicKey;
    }
    vapidAvailable.value = false;
    return null;
  } catch {
    vapidAvailable.value = false;
    return null;
  }
}

/** Register (or reuse) the ROOT-scoped push service worker that handles delivery. */
async function getPushRegistration(): Promise<ServiceWorkerRegistration> {
  // The push SW lives at /service-worker.js with root scope; this is separate
  // from the app-shell SW at /app/sw-app.js (different URL + scope → no conflict).
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (existing) return existing;
  return navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
}

/** Load the current subscription state for this browser + the account count. */
export async function refreshStatus(): Promise<void> {
  getPermissionState();
  if (!pushSupported.value) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    subscribed.value = sub !== null;
  } catch {
    subscribed.value = false;
  }
  try {
    const res = await fetch('/api/push/subscriptions', { credentials: 'include' });
    if (res.ok) {
      const body = (await res.json()) as { count?: number };
      subscriptionCount.value = typeof body.count === 'number' ? body.count : null;
    }
  } catch {
    // Leave the count as-is on failure.
  }
}

/** Enable push: request permission, subscribe, and register with the server. */
export async function subscribe(): Promise<boolean> {
  pushError.value = null;
  if (!pushSupported.value) {
    pushError.value = 'Push notifications are not supported in this browser.';
    return false;
  }
  pushBusy.value = true;
  try {
    const key = vapidPublicKey ?? (await loadVapidKey());
    if (!key) {
      pushError.value = 'Push notifications are not configured on the server.';
      return false;
    }

    const perm = await Notification.requestPermission();
    permission.value = perm;
    if (perm !== 'granted') {
      pushError.value = 'Notification permission was not granted.';
      return false;
    }

    const reg = await getPushRegistration();
    await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    if (!res.ok) {
      pushError.value = `Failed to register subscription (${res.status}).`;
      return false;
    }

    subscribed.value = true;
    await refreshStatus();
    return true;
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : 'Failed to enable push notifications.';
    return false;
  } finally {
    pushBusy.value = false;
  }
}

/** Disable push: unregister with the server and unsubscribe locally. */
export async function unsubscribe(): Promise<boolean> {
  pushError.value = null;
  if (!pushSupported.value) return false;
  pushBusy.value = true;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
    }
    subscribed.value = false;
    await refreshStatus();
    return true;
  } catch (err) {
    pushError.value = err instanceof Error ? err.message : 'Failed to disable push notifications.';
    return false;
  } finally {
    pushBusy.value = false;
  }
}

/** One-shot initial load for the Settings page. */
export async function initPush(): Promise<void> {
  getPermissionState();
  await loadVapidKey();
  await refreshStatus();
}
