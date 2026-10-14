import { describe, it, expect, vi } from 'vitest';
import { MatrixService, isMatrixConfigured } from '../../src/services/matrix.js';

const CONFIG = {
  homeserver: 'https://matrix.example.org',
  accessToken: 'syt_secret_token',
  roomId: '!room:example.org',
};

/** A fake fetch that records its last call and returns a canned status. */
function fakeFetch(status: number) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = vi.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => '' };
  });
  return { impl, calls };
}

describe('MatrixService', () => {
  it('sends a PUT to the room send endpoint with bearer auth and an m.text body', async () => {
    const { impl, calls } = fakeFetch(200);
    const svc = new MatrixService(impl as any);

    const result = await svc.send(CONFIG, { text: 'Reminder: call Mum' });

    expect(result.sent).toBe(true);
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toMatch(
      /^https:\/\/matrix\.example\.org\/_matrix\/client\/v3\/rooms\/%21room%3Aexample\.org\/send\/m\.room\.message\/[^/]+$/,
    );
    expect(init.method).toBe('PUT');
    expect(init.headers.Authorization).toBe('Bearer syt_secret_token');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body.msgtype).toBe('m.text');
    expect(body.body).toBe('Reminder: call Mum');
  });

  it('includes an HTML formatted_body when html is provided', async () => {
    const { impl, calls } = fakeFetch(200);
    const svc = new MatrixService(impl as any);

    await svc.send(CONFIG, { text: 'plain', html: '<b>rich</b>' });

    const body = JSON.parse(calls[0].init.body);
    expect(body.format).toBe('org.matrix.custom.html');
    expect(body.formatted_body).toBe('<b>rich</b>');
  });

  it('uses a unique transaction id per send', async () => {
    const { impl, calls } = fakeFetch(200);
    const svc = new MatrixService(impl as any);
    await svc.send(CONFIG, { text: 'one' });
    await svc.send(CONFIG, { text: 'two' });
    const txn = (u: string) => u.split('/').pop();
    expect(txn(calls[0].url)).not.toBe(txn(calls[1].url));
  });

  it('strips a trailing slash from the homeserver URL', async () => {
    const { impl, calls } = fakeFetch(200);
    const svc = new MatrixService(impl as any);
    await svc.send({ ...CONFIG, homeserver: 'https://matrix.example.org/' }, { text: 'hi' });
    expect(calls[0].url).toContain('https://matrix.example.org/_matrix/client/v3/rooms/');
  });

  it('does not call fetch and reports not-sent when config is incomplete', async () => {
    const { impl, calls } = fakeFetch(200);
    const svc = new MatrixService(impl as any);
    const result = await svc.send({ homeserver: 'https://x', accessToken: '', roomId: '!r:x' }, { text: 'hi' });
    expect(result.sent).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('reports not-sent with an error on a non-2xx response', async () => {
    const { impl } = fakeFetch(403);
    const svc = new MatrixService(impl as any);
    const result = await svc.send(CONFIG, { text: 'hi' });
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/403/);
  });

  it('does not throw and reports not-sent when the network call fails', async () => {
    const impl = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    const svc = new MatrixService(impl as any);
    const result = await svc.send(CONFIG, { text: 'hi' });
    expect(result.sent).toBe(false);
    expect(result.error).toMatch(/ECONNREFUSED/);
  });
});

describe('isMatrixConfigured', () => {
  it('is true only when homeserver, accessToken and roomId are all present', () => {
    expect(isMatrixConfigured(CONFIG)).toBe(true);
    expect(isMatrixConfigured({ ...CONFIG, accessToken: '' })).toBe(false);
    expect(isMatrixConfigured({ homeserver: '', accessToken: '', roomId: '' })).toBe(false);
    expect(isMatrixConfigured(null)).toBe(false);
    expect(isMatrixConfigured(undefined)).toBe(false);
  });
});
