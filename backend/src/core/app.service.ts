import { ConflictException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/sequelize';
import { JwtService } from '@nestjs/jwt';
import { QueryTypes, Sequelize, UniqueConstraintError } from 'sequelize';
import * as argon2 from 'argon2';
import { UAParser } from 'ua-parser-js';
import { Link } from '../models/link.model';
import { User } from '../models/user.model';
import { generateCode } from '../links/domain/short-code';
import { validateDestination } from '../links/domain/url-validation';
import { ClickQueueService } from '../infrastructure/clicks/click-queue.service';
import { RedirectCacheService } from '../infrastructure/redis/redirect-cache.service';
import { RateLimitService } from '../infrastructure/redis/rate-limit.service';

@Injectable()
export class AppService {
  constructor(
    @InjectConnection() private readonly sequelize: Sequelize,
    @InjectModel(User) private readonly users: typeof User,
    @InjectModel(Link) private readonly links: typeof Link,
    private readonly jwt: JwtService,
    private readonly clickQueue: ClickQueueService,
    private readonly cache: RedirectCacheService,
    private readonly rateLimit: RateLimitService,
  ) {}

  async register(email: string, password: string) {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    let user: User;
    try { user = await this.users.create({ email: normalized, passwordHash }); }
    catch (error) { if (error instanceof UniqueConstraintError) throw new ConflictException('Email already registered'); throw error; }
    return { user: { id: user.id, email: user.email }, accessToken: this.jwt.sign({ sub: user.id }) };
  }

  async login(email: string, password: string, ip = 'unknown') {
    await this.rateLimit.checkLoginAttempt(ip);
    const user = await this.users.findOne({ where: { email: email.trim().toLowerCase() } });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      await this.rateLimit.recordLoginFailure(ip);
      throw new Error('UNAUTHORIZED');
    }
    return { user: { id: user.id, email: user.email }, accessToken: this.jwt.sign({ sub: user.id }) };
  }

  async currentUser(id: string) {
    const user = await this.users.findByPk(id, { attributes: ['id', 'email'] });
    if (!user) throw new Error('UNAUTHORIZED');
    return { id: user.id, email: user.email };
  }

  async createLink(ownerId: string, input: { destinationUrl: string; customAlias?: string; expiresAt?: string }, ip: string) {
    await this.rateLimit.checkLinkCreation(ownerId, ip);
    let destinationUrl: string;
    try { destinationUrl = await validateDestination(input.destinationUrl); }
    catch { throw new Error('INVALID_DESTINATION'); }
    if (input.customAlias && !/^[A-Za-z0-9_-]{3,32}$/.test(input.customAlias)) throw new Error('INVALID_ALIAS');
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) throw new Error('INVALID_EXPIRY');
    const common = { ownerId, destinationUrl, expiresAt };
    if (input.customAlias) return this.createLinkRecord({ ...common, code: input.customAlias });
    for (let attempt = 0; attempt < 5; attempt++) {
      try { return await this.createLinkRecord({ ...common, code: generateCode(8) }); }
      catch (error) { if (!(error instanceof UniqueConstraintError) || !error.fields?.code) throw error; }
    }
    throw new Error('CODE_COLLISION');
  }

  private async createLinkRecord(values: { ownerId: string; destinationUrl: string; expiresAt: Date | null; code: string }) {
    const link = await this.links.create(values);
    return { id: link.id, code: link.code, destinationUrl: link.destinationUrl, createdAt: link.createdAt, expiresAt: link.expiresAt };
  }

  async listLinks(ownerId: string, page = 0, size = 20, sort = 'createdAt') {
    const orderBy: Record<string, string> = { createdAt: 'l.created_at DESC', createdAtAsc: 'l.created_at ASC', clicks: '"totalClicks" DESC' };
    const order = orderBy[sort] || orderBy.createdAt;
    const [items, totalItems] = await Promise.all([
      this.sequelize.query<any>(
        `SELECT l.id, l.code, l.destination_url AS "destinationUrl", l.created_at AS "createdAt", l.expires_at AS "expiresAt", COUNT(c.id)::int AS "totalClicks"
         FROM links l LEFT JOIN click_events c ON c.link_id = l.id WHERE l.owner_id = :ownerId
         GROUP BY l.id ORDER BY ${order} LIMIT :size OFFSET :offset`,
        { replacements: { ownerId, size, offset: page * size }, type: QueryTypes.SELECT },
      ),
      this.links.count({ where: { ownerId } }),
    ]);
    return {
      items: items.map(link => ({ ...link, shortUrl: `${process.env.PUBLIC_BASE_URL}/${link.code}`, totalClicks: Number(link.totalClicks) })),
      page, size, totalItems, totalPages: Math.ceil(totalItems / size),
    };
  }

  ownedLink(id: string, ownerId: string) { return this.links.findOne({ where: { id, ownerId } }); }

  async deleteLink(id: string, ownerId: string) {
    const transaction = await this.sequelize.transaction();
    let code: string;
    try {
      const link = await this.links.findOne({ where: { id, ownerId }, transaction, lock: transaction.LOCK.UPDATE });
      if (!link) { await transaction.rollback(); return false; }
      code = link.code;
      await link.destroy({ transaction });
      await transaction.commit();
    } catch (error) { await transaction.rollback(); throw error; }
    await this.cache.invalidate(code!);
    return true;
  }

  async redirect(code: string, headers: Record<string, string | string[] | undefined>) {
    let link = await this.cache.get(code) || null;
    if (!link) {
      const record = await this.links.findOne({ where: { code }, attributes: ['id', 'destinationUrl', 'expiresAt'] });
      if (record) {
        link = { id: record.id, destinationUrl: record.destinationUrl, expiresAt: record.expiresAt };
        await this.cache.set(code, link);
      }
    }
    if (!link) return { status: 404 };
    if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) return { status: 410 };
    const ref = headers.referer;
    let referrerHost: string | null = null;
    try { if (typeof ref === 'string') referrerHost = new URL(ref).hostname.slice(0, 253); } catch { /* malformed referrer is direct */ }
    const ua = new UAParser(String(headers['user-agent'] || '').slice(0, 512));
    const deviceInfo = ua.getDevice();
    const device = deviceInfo.type === 'mobile' ? 'mobile' : deviceInfo.type === 'tablet' ? 'tablet' : ua.getBrowser().name || ua.getOS().name ? 'desktop' : 'unknown';
    void this.clickQueue.enqueue({ linkId: link.id, clickedAt: new Date().toISOString(), referrerHost, device });
    return { status: 302, destinationUrl: link.destinationUrl };
  }

  async analytics(id: string, ownerId: string, kind: string, days = 30, limit = 10) {
    const link = await this.links.findOne({ where: { id, ownerId }, attributes: ['id'] });
    if (!link) return null;
    const from = new Date(); from.setUTCHours(0, 0, 0, 0); from.setUTCDate(from.getUTCDate() - (days - 1));
    if (kind === 'summary') {
      const [row] = await this.sequelize.query<any>(
        `SELECT COUNT(*)::int AS "totalClicks", COUNT(*) FILTER (WHERE clicked_at >= NOW() - INTERVAL '30 days')::int AS "clicksLast30Days", MIN(clicked_at) AS "firstClickAt", MAX(clicked_at) AS "lastClickAt" FROM click_events WHERE link_id = :id`,
        { replacements: { id }, type: QueryTypes.SELECT },
      );
      return row;
    }
    if (kind === 'clicks') {
      const rows = await this.sequelize.query<{ date: string; clicks: number }>(
        'SELECT day::text AS date, clicks::int AS clicks FROM daily_link_stats WHERE link_id = :id AND day >= CAST(:from AS date) ORDER BY day',
        { replacements: { id, from: from.toISOString().slice(0, 10) }, type: QueryTypes.SELECT },
      );
      const data = new Map(rows.map(row => [row.date.slice(0, 10), Number(row.clicks)]));
      return { days, items: Array.from({ length: days }, (_, i) => { const date = new Date(from); date.setUTCDate(date.getUTCDate() + i); const key = date.toISOString().slice(0, 10); return { date: key, clicks: data.get(key) || 0 }; }) };
    }
    if (kind === 'referrers') {
      const items = await this.sequelize.query<{ referrer: string; clicks: number }>(
        'SELECT COALESCE(referrer_host, \'direct\') AS referrer, COUNT(*)::int AS clicks FROM click_events WHERE link_id = :id AND clicked_at >= :from GROUP BY 1 ORDER BY clicks DESC LIMIT :limit',
        { replacements: { id, from, limit }, type: QueryTypes.SELECT },
      );
      return { items };
    }
    const rows = await this.sequelize.query<{ device: string; clicks: number }>(
      'SELECT device, COUNT(*)::int AS clicks FROM click_events WHERE link_id = :id AND clicked_at >= :from GROUP BY device',
      { replacements: { id, from }, type: QueryTypes.SELECT },
    );
    return { items: ['mobile', 'desktop', 'tablet', 'unknown'].map(device => ({ device, clicks: Number(rows.find(row => row.device === device)?.clicks || 0) })) };
  }

  async checkDatabase() { await this.sequelize.authenticate(); }
}
