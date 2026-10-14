import { RedirectCacheService } from './redirect-cache.service';

describe('RedirectCacheService', () => {
  const keys = { enabled: process.env.REDIRECT_CACHE_ENABLED, ttl: process.env.CACHE_MAX_TTL_SECONDS };
  afterEach(() => {
    if (keys.enabled === undefined) delete process.env.REDIRECT_CACHE_ENABLED; else process.env.REDIRECT_CACHE_ENABLED = keys.enabled;
    if (keys.ttl === undefined) delete process.env.CACHE_MAX_TTL_SECONDS; else process.env.CACHE_MAX_TTL_SECONDS = keys.ttl;
  });

  it('reads JSON records and tracks cache hits', async () => {
    const record = { id: 'link-id', destinationUrl: 'https://example.com', expiresAt: null };
    const client: any = { get: jest.fn().mockResolvedValue(JSON.stringify(record)), incr: jest.fn() };
    await expect(new RedirectCacheService({ client } as any).get('code')).resolves.toEqual(record);
    expect(client.incr).toHaveBeenCalledWith('shortlink:metrics:cache:hits');
  });

  it('treats missing and malformed cache values as misses without breaking redirects', async () => {
    const client: any = { get: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce('{'), incr: jest.fn().mockResolvedValue(1) };
    const service = new RedirectCacheService({ client } as any);
    const logger = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    await expect(service.get('missing')).resolves.toBeUndefined();
    await expect(service.get('bad-json')).resolves.toBeUndefined();
    expect(client.incr).toHaveBeenCalledWith('shortlink:metrics:cache:misses');
    expect(logger).toHaveBeenCalled();
  });

  it('caps cache TTL at expiry and skips already-expired entries', async () => {
    process.env.CACHE_MAX_TTL_SECONDS = '3600';
    const client: any = { set: jest.fn().mockResolvedValue('OK') };
    const service = new RedirectCacheService({ client } as any);
    await service.set('future', { id: '1', destinationUrl: 'https://example.com', expiresAt: new Date(Date.now() + 120_000) });
    expect(client.set).toHaveBeenCalledWith(expect.stringContaining('future'), expect.any(String), 'EX', expect.any(Number));
    const ttl = client.set.mock.calls[0][3];
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(120);
    client.set.mockClear();
    await service.set('expired', { id: '1', destinationUrl: 'https://example.com', expiresAt: new Date(Date.now() - 1000) });
    expect(client.set).not.toHaveBeenCalled();
  });

  it('honors cache disable and still invalidates a key', async () => {
    process.env.REDIRECT_CACHE_ENABLED = 'false';
    const client: any = { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(1) };
    const service = new RedirectCacheService({ client } as any);
    await expect(service.get('code')).resolves.toBeUndefined();
    await service.set('code', { id: 'i', destinationUrl: 'https://example.com', expiresAt: null });
    await service.invalidate('code');
    expect(client.get).not.toHaveBeenCalled();
    expect(client.set).not.toHaveBeenCalled();
    expect(client.del).toHaveBeenCalledWith('shortlink:cache:redirect:code');
  });
});
