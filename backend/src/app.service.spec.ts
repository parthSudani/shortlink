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

describe('link lifecycle and analytics service branches', () => {
  const setup = () => {
    const links: any = { create: jest.fn(), findOne: jest.fn(), count: jest.fn() };
    const sequelize: any = { query: jest.fn(), transaction: jest.fn() };
    const rateLimit: any = { checkLinkCreation: jest.fn().mockResolvedValue(undefined) };
    const cache: any = { invalidate: jest.fn().mockResolvedValue(undefined) };
    const service: any = Object.create(AppService.prototype);
    Object.assign(service, { links, sequelize, rateLimit, cache });
    return { service, links, sequelize, rateLimit, cache };
  };

  it('validates destinations and aliases before writing a link', async () => {
    const { service, links, rateLimit } = setup();
    await expect(service.createLink('owner', { destinationUrl: 'ftp://example.com' }, 'ip')).rejects.toThrow('INVALID_DESTINATION');
    await expect(service.createLink('owner', { destinationUrl: 'https://example.com', customAlias: 'x' }, 'ip')).rejects.toThrow('INVALID_ALIAS');
    expect(rateLimit.checkLinkCreation).toHaveBeenCalledTimes(2);
    expect(links.create).not.toHaveBeenCalled();
  });

  it('rejects invalid and past expiry dates before inserting', async () => {
    const { service, links } = setup();
    for (const expiresAt of ['not-a-date', '2000-01-01T00:00:00.000Z']) {
      await expect(service.createLink('owner', { destinationUrl: 'https://example.com', customAlias: 'valid-code', expiresAt }, 'ip')).rejects.toThrow('INVALID_EXPIRY');
    }
    expect(links.create).not.toHaveBeenCalled();
  });

  it('creates a custom alias with a normalized destination and future expiry', async () => {
    const { service, links } = setup();
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    links.create.mockImplementation(async (input: any) => ({ id: 'link-id', ...input, createdAt: new Date('2026-01-01') }));
    await expect(service.createLink('owner', { destinationUrl: 'https://example.com/path', customAlias: 'my_alias', expiresAt }, 'ip'))
      .resolves.toMatchObject({ id: 'link-id', code: 'my_alias', destinationUrl: 'https://example.com/path' });
    expect(links.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'owner', code: 'my_alias', expiresAt: new Date(expiresAt) }));
  });

  it('returns a conflict for an already-used custom alias', async () => {
    const { service, links } = setup();
    // Use the Sequelize class so the service's collision branch recognizes it.
    const { UniqueConstraintError } = require('sequelize');
    links.create.mockRejectedValue(new UniqueConstraintError({ message: 'duplicate code', fields: { code: 'my_alias' } }));
    await expect(service.createLink('owner', { destinationUrl: 'https://example.com', customAlias: 'my_alias' }, 'ip')).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('retries generated-code collisions up to the configured attempt count', async () => {
    const { service, links } = setup();
    const { UniqueConstraintError } = require('sequelize');
    links.create.mockRejectedValue(new UniqueConstraintError({ message: 'duplicate code', fields: { code: 'collision' } }));
    await expect(service.createLink('owner', { destinationUrl: 'https://example.com' }, 'ip')).rejects.toThrow('CODE_COLLISION');
    expect(links.create).toHaveBeenCalledTimes(5);
  });

  it('deletes only an owned link transactionally and invalidates its redirect cache', async () => {
    const { service, links, sequelize, cache } = setup();
    const tx: any = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    const link: any = { code: 'abc123', destroy: jest.fn().mockResolvedValue(undefined) };
    sequelize.transaction.mockResolvedValue(tx);
    links.findOne.mockResolvedValue(link);
    await expect(service.deleteLink('link-id', 'owner')).resolves.toBe(true);
    expect(links.findOne).toHaveBeenCalledWith({ where: { id: 'link-id', ownerId: 'owner' }, transaction: tx, lock: 'UPDATE' });
    expect(link.destroy).toHaveBeenCalledWith({ transaction: tx });
    expect(tx.commit).toHaveBeenCalled();
    expect(cache.invalidate).toHaveBeenCalledWith('abc123');
  });

  it('does not invalidate cache or commit when deletion target is not owned', async () => {
    const { service, links, sequelize, cache } = setup();
    const tx: any = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    sequelize.transaction.mockResolvedValue(tx);
    links.findOne.mockResolvedValue(null);
    await expect(service.deleteLink('other-user-link', 'owner')).resolves.toBe(false);
    expect(tx.rollback).toHaveBeenCalled();
    expect(tx.commit).not.toHaveBeenCalled();
    expect(cache.invalidate).not.toHaveBeenCalled();
  });

  it('returns zero-filled daily analytics for days without clicks', async () => {
    const { service, links, sequelize } = setup();
    links.findOne.mockResolvedValue({ id: 'link-id' });
    sequelize.query.mockResolvedValue([{ date: '2026-10-14', clicks: 3 }]);
    const result = await service.analytics('link-id', 'owner', 'clicks', 2);
    expect(result.days).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.find((day: any) => day.date === '2026-10-14')).toEqual({ date: '2026-10-14', clicks: 3 });
    expect(result.items.some((day: any) => day.clicks === 0)).toBe(true);
  });

  it.each(['summary', 'referrers', 'devices'])('queries %s analytics only after confirming ownership', async kind => {
    const { service, links, sequelize } = setup();
    links.findOne.mockResolvedValue({ id: 'link-id' });
    sequelize.query.mockResolvedValue([{ totalClicks: 3, referrer: 'example.com', device: 'mobile', clicks: 3 }]);
    await service.analytics('link-id', 'owner', kind);
    expect(links.findOne).toHaveBeenCalledWith({ where: { id: 'link-id', ownerId: 'owner' }, attributes: ['id'] });
    expect(sequelize.query).toHaveBeenCalledTimes(1);
  });

  it('returns null and performs no analytics query for a link owned by someone else', async () => {
    const { service, links, sequelize } = setup();
    links.findOne.mockResolvedValue(null);
    await expect(service.analytics('link-id', 'owner', 'summary')).resolves.toBeNull();
    expect(sequelize.query).not.toHaveBeenCalled();
  });
});
