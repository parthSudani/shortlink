import 'reflect-metadata';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { UniqueConstraintError } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { postgresOptions } from '../src/database-options';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ClickEvent } from '../src/models/click-event.model';
import { DailyLinkStat } from '../src/models/daily-link-stat.model';
import { Link } from '../src/models/link.model';
import { User } from '../src/models/user.model';

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
});
