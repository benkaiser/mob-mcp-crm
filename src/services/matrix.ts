import { randomBytes } from 'node:crypto';

// ─── Types ──────────────────────────────────────────────────────

/** Connection details for a Matrix room the notifications are posted to. */
export interface MatrixConfig {
  /** Homeserver base URL, e.g. `https://matrix.example.org`. */
  homeserver: string;
  /** A bot/user access token with permission to send to the room. */
  accessToken: string;
  /** Target room id (`!abc:server`) or alias the token can post to. */
  roomId: string;
}

export interface MatrixMessage {
  /** Plain-text body (always provided; the fallback for non-HTML clients). */
  text: string;
  /** Optional HTML body, sent as `formatted_body` with the custom-html format. */
  html?: string;
}

export interface MatrixSendResult {
  sent: boolean;
  /** Set when `sent` is false: why delivery didn't happen. */
  error?: string;
}

/** A minimal subset of the global `fetch` signature, for injection in tests. */
export type MatrixFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal },
) => Promise<{ status: number; text: () => Promise<string> }>;

const SEND_TIMEOUT_MS = 10_000;

/** True only when every field needed to send is present and non-empty. */
export function isMatrixConfigured(cfg: Partial<MatrixConfig> | null | undefined): cfg is MatrixConfig {
  return !!cfg && !!cfg.homeserver && !!cfg.accessToken && !!cfg.roomId;
}

/**
 * Encode a single URL path segment per RFC3986, including the sub-delimiters
 * (`!'()*`) that `encodeURIComponent` leaves untouched. Matrix room ids start
 * with `!`, and the spec's canonical path form encodes it as `%21`.
 */
function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

// ─── Service ────────────────────────────────────────────────────

/**
 * Posts notification messages to a Matrix room via the client-server API
 * (`PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}`).
 *
 * Mirrors EmailService's "degrade gracefully, never throw" contract: a missing
 * config or a failed request returns `{ sent: false, error }` and logs a
 * warning, so a bad token can never crash the notification schedulers.
 *
 * Note: this sends unencrypted events, so the target room must have end-to-end
 * encryption disabled (use a dedicated notifications room).
 */
export class MatrixService {
  private fetchImpl: MatrixFetch;

  constructor(fetchImpl?: MatrixFetch) {
    // Default to the global fetch (Node 20+). Bound so `this` is preserved.
    this.fetchImpl = fetchImpl ?? ((url, init) => fetch(url, init) as unknown as ReturnType<MatrixFetch>);
  }

  async send(cfg: Partial<MatrixConfig> | null | undefined, msg: MatrixMessage): Promise<MatrixSendResult> {
    if (!isMatrixConfigured(cfg)) {
      console.warn('[matrix] not configured - skipping message. Set homeserver, access token and room id to enable delivery.');
      return { sent: false, error: 'Matrix is not configured' };
    }

    const base = cfg.homeserver.replace(/\/+$/, '');
    const txnId = `mob-${Date.now()}-${randomBytes(6).toString('hex')}`;
    const url = `${base}/_matrix/client/v3/rooms/${encodePathSegment(cfg.roomId)}/send/m.room.message/${encodePathSegment(txnId)}`;

    const payload: Record<string, unknown> = { msgtype: 'm.text', body: msg.text };
    if (msg.html) {
      payload.format = 'org.matrix.custom.html';
      payload.formatted_body = msg.html;
    }

    try {
      const res = await this.fetchImpl(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.accessToken}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (res.status >= 200 && res.status < 300) {
        return { sent: true };
      }
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
      return { sent: false, error: `Matrix responded ${res.status}${detail ? `: ${detail}` : ''}` };
    } catch (err) {
      return { sent: false, error: (err as Error).message };
    }
  }
}
