import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiRequest, setUnauthorizedHandler } from './client';

describe('api client', () => {
  afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); setUnauthorizedHandler(() => undefined); });

  it('sends the session bearer token and invokes session expiry handling on 401', async () => {
    sessionStorage.setItem('accessToken', 'test-token');
    const unauthorized = vi.fn();
    setUnauthorizedHandler(unauthorized);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'sensitive backend detail' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest('/api/v1/auth/me')).rejects.toMatchObject({ status: 401, message: 'Your session has expired or your credentials are invalid.' });
    expect(fetchMock.mock.calls[0][1].headers.get('Authorization')).toBe('Bearer test-token');
    expect(unauthorized).toHaveBeenCalledOnce();
  });

  it('parses validation details and Retry-After from standard API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ statusCode: 429, code: 'RATE_LIMITED', message: 'private text', details: [{ field: 'customAlias', message: 'Unavailable' }] }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '45' } })));
    try { await apiRequest('/api/v1/links', { method: 'POST', body: JSON.stringify({}) }); throw new Error('expected failure'); }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ status: 429, retryAfterSeconds: 45, details: [{ field: 'customAlias', message: 'Unavailable' }] });
      expect((error as Error).message).toBe('Too many requests. Please wait before trying again.');
    }
  });

  it('does not expose internal messages from server errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'database password detail' }), { status: 500 })));
    await expect(apiRequest('/api/v1/links')).rejects.toMatchObject({ status: 500, message: 'The service could not complete your request. Try again shortly.' });
  });
});
