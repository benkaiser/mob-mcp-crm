import { signal, computed } from '@preact/signals';
import { apiGet, ApiError } from '../api/client';
import type { Me } from '../api/types';

/** The signed-in user, or null until loaded (or on failure). */
export const user = signal<Me | null>(null);

/** True while the initial /me request is in flight. */
export const sessionLoading = signal(false);

/** Holds an error from the last loadSession() attempt (non-401). */
export const sessionError = signal<ApiError | null>(null);

/** True once a session load has completed (success or error). */
export const sessionLoaded = signal(false);

/** Convenience: is there an authenticated user? */
export const isAuthenticated = computed(() => user.value !== null);

/**
 * Load the current user from GET /web/api/me into the session store.
 * On 401 the client sets the authFailed signal (handled by the auth guard);
 * we surface other errors via sessionError.
 */
export async function loadSession(): Promise<void> {
  sessionLoading.value = true;
  sessionError.value = null;
  try {
    const { data } = await apiGet<Me>('/me');
    user.value = data;
  } catch (err) {
    user.value = null;
    if (err instanceof ApiError && err.status !== 401) {
      sessionError.value = err;
    }
  } finally {
    sessionLoading.value = false;
    sessionLoaded.value = true;
  }
}
