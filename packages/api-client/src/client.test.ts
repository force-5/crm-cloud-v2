import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, HttpClient } from './client';

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('HttpClient', () => {
  it('fetches a CSRF token before the first mutation and sends it', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(200, { csrfToken: 'tok-1' }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    const http = new HttpClient({ baseUrl: '/crm/api', fetchImpl });

    await http.post('/auth/keepalive');

    expect(fetchImpl.mock.calls[0]![0]).toBe('/crm/api/auth/csrf');
    const init = fetchImpl.mock.calls[1]![1]!;
    expect((init.headers as Record<string, string>)['x-csrf-token']).toBe('tok-1');
    expect(init.credentials).toBe('include');
  });

  it('refreshes the CSRF token once and retries on a CSRF error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(403, { error: { code: 'CSRF', message: 'bad token' } }))
      .mockResolvedValueOnce(json(200, { csrfToken: 'tok-2' }))
      .mockResolvedValueOnce(json(200, { saved: true }));
    const http = new HttpClient({ baseUrl: '', fetchImpl });
    http.setCsrfToken('stale');

    await expect(http.put('/profile', { firstName: 'A' })).resolves.toEqual({ saved: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('calls onUnauthorized on 401 and surfaces the error envelope', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'Sign in again' } }));
    const http = new HttpClient({ baseUrl: '', fetchImpl, onUnauthorized });

    const err = await http.get('/auth/session').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect((err as ApiClientError).code).toBe('UNAUTHENTICATED');
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('drops empty query params and maps network failures', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json(200, []));
    const http = new HttpClient({ baseUrl: '', fetchImpl });
    await http.get('/accounts', { page: 2, search: '', status: 'all', sort: undefined });
    expect(fetchImpl.mock.calls[0]![0]).toBe('/accounts?page=2&status=all');

    fetchImpl.mockRejectedValueOnce(new TypeError('offline'));
    await expect(http.get('/x')).rejects.toMatchObject({ status: 0, code: 'SERVICE_UNAVAILABLE' });
  });
});
