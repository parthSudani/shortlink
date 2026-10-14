import { AppService } from './app.service';

describe('redirect behavior', () => {
  const setup = () => {
    const db: any = { findOne: jest.fn() };
    const clicks: any = { enqueue: jest.fn().mockResolvedValue(true) };
    const cache: any = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn(), invalidate: jest.fn() };
    const service: any = Object.create(AppService.prototype);
    service.links = db;
    service.clickQueue = clicks;
    service.cache = cache;
    service.logger = { warn: jest.fn() };
    return { db, clicks, cache, service };
  };
  it('returns 404 for an unknown code without negative caching', async () => {
    const { service, db, cache } = setup(); db.findOne.mockResolvedValue(null);
    await expect(service.redirect('missing', {})).resolves.toEqual({ status: 404 });
    expect(cache.set).not.toHaveBeenCalled();
  });
  it('returns 410 for an expired cached value without a database lookup', async () => {
    const { service, db, cache } = setup();
    cache.get.mockResolvedValue({ id: 'l', destinationUrl: 'https://example.com', expiresAt: new Date(Date.now() - 1000).toISOString() });
    await expect(service.redirect('expired', {})).resolves.toEqual({ status: 410 });
    expect(db.findOne).not.toHaveBeenCalled();
  });
  it('falls back to PostgreSQL on cache miss and enqueues compact click data', async () => {
    const { service, db, clicks, cache } = setup();
    db.findOne.mockResolvedValue({ id: 'link-id', destinationUrl: 'https://example.com', expiresAt: null });
    const result = await service.redirect('active', { referer: 'https://news.example/story', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1' });
    expect(result).toEqual({ status: 302, destinationUrl: 'https://example.com' });
    expect(cache.set).toHaveBeenCalledWith('active', expect.objectContaining({ id: 'link-id' }));
    expect(clicks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ linkId: 'link-id', referrerHost: 'news.example', device: 'mobile' }));
  });
});
