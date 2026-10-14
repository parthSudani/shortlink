import 'reflect-metadata';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { postgresOptions } from '../src/config/database.config';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ClickEvent } from '../src/models/click-event.model';
import { DailyLinkStat } from '../src/models/daily-link-stat.model';
import { Link } from '../src/models/link.model';
import { User } from '../src/models/user.model';
import { AppService } from '../src/core/app.service';
import { JwtService } from '@nestjs/jwt';
import { persistClickBatch } from '../src/infrastructure/clicks/click-processor';

describe('PostgreSQL Sequelize migrations and persistence', () => {
  let container: StartedPostgreSqlContainer;
  let sequelize: Sequelize;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').withDatabase('shortlink').withUsername('shortlink').withPassword('local-dev-password').start();
    const databaseUrl = container.getConnectionUri();
    const cli = require.resolve('sequelize-cli/lib/sequelize');
    execFileSync(process.execPath, [cli, 'db:migrate', '--config', 'sequelize.config.cjs', '--migrations-path', 'migrations'], {
      cwd: resolve(__dirname, '..'), env: { ...process.env, DATABASE_URL: databaseUrl }, stdio: 'inherit',
    });
    sequelize = new Sequelize({ ...postgresOptions(databaseUrl), models: [User, Link, ClickEvent, DailyLinkStat] });
    await sequelize.authenticate();
  });

  afterAll(async () => { await sequelize?.close(); await container?.stop(); });

  it('applies migrations, persists records, and enforces unique email and code constraints', async () => {
    const user = await User.create({ email: 'test@example.com', passwordHash: 'argon-hash' });
    const link = await Link.create({ ownerId: user.id, code: 'testcode', destinationUrl: 'https://example.com', expiresAt: null });
    await ClickEvent.create({ linkId: link.id, clickedAt: new Date(), referrerHost: 'news.example', device: 'desktop', idempotencyKey: 'event-one' });

    expect(await Link.count({ where: { ownerId: user.id } })).toBe(1);
    expect(await ClickEvent.count({ where: { linkId: link.id } })).toBe(1);
    await expect(User.create({ email: 'test@example.com', passwordHash: 'other' })).rejects.toBeInstanceOf(UniqueConstraintError);
    await expect(Link.create({ ownerId: user.id, code: 'testcode', destinationUrl: 'https://example.net', expiresAt: null })).rejects.toBeInstanceOf(UniqueConstraintError);
  });

  it('runs the redirect and asynchronous click-recording flow through PostgreSQL analytics', async () => {
    const owner = await User.create({ email: 'redirect-flow@example.com', passwordHash: 'argon-hash' });
    const link = await Link.create({ ownerId: owner.id, code: 'flow1234', destinationUrl: 'https://destination.example/path', expiresAt: null });
    const queued: any[] = [];
    const clickQueue: any = { enqueue: jest.fn(async (event: any) => { queued.push({ ...event, id: 'event-flow-1' }); return true; }) };
    const cache: any = { get: jest.fn().mockResolvedValue(undefined), set: jest.fn().mockResolvedValue(undefined) };
    const rateLimit: any = { checkLinkCreation: jest.fn() };
    const service = new AppService(sequelize, User as any, Link as any, new JwtService({ secret: 'integration-test-secret-long-enough' }), clickQueue, cache, rateLimit);

    await expect(service.redirect(link.code, {
      referer: 'https://news.example/article',
      'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1',
    })).resolves.toEqual({ status: 302, destinationUrl: link.destinationUrl });
    expect(cache.set).toHaveBeenCalledWith(link.code, expect.objectContaining({ id: link.id }));
    expect(clickQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(queued[0]).toMatchObject({ linkId: link.id, referrerHost: 'news.example', device: 'mobile' });

    // The request path only enqueues. A worker persists the event and updates its daily aggregate later.
    await expect(ClickEvent.count({ where: { linkId: link.id } })).resolves.toBe(0);
    await expect(persistClickBatch(sequelize, queued)).resolves.toBe(1);
    await expect(service.analytics(link.id, owner.id, 'summary')).resolves.toMatchObject({ totalClicks: 1, clicksLast30Days: 1 });
    await expect(service.analytics(link.id, owner.id, 'clicks', 30)).resolves.toMatchObject({ days: 30, items: expect.arrayContaining([expect.objectContaining({ clicks: 1 })]) });
    await expect(service.analytics(link.id, owner.id, 'referrers')).resolves.toEqual({ items: [{ referrer: 'news.example', clicks: 1 }] });
    await expect(service.analytics(link.id, owner.id, 'devices')).resolves.toEqual({ items: expect.arrayContaining([{ device: 'mobile', clicks: 1 }]) });
  });
});
