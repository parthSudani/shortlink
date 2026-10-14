import { Injectable, Logger } from '@nestjs/common';
import { RedisConnectionService } from './redis-connection.service';

export type RedirectRecord = { id: string; destinationUrl: string; expiresAt: string | Date | null };
const PREFIX = 'shortlink:cache:redirect:';

@Injectable()
export class RedirectCacheService {
  private readonly logger = new Logger(RedirectCacheService.name);
  constructor(private readonly redis: RedisConnectionService) {}

  async get(code: string): Promise<RedirectRecord | null | undefined> {
    if (process.env.REDIRECT_CACHE_ENABLED === 'false') return undefined;
    try {
      const raw = await this.redis.client.get(`${PREFIX}${code}`);
      if (!raw) { await this.redis.client.incr('shortlink:metrics:cache:misses'); return undefined; }
      await this.redis.client.incr('shortlink:metrics:cache:hits');
      return JSON.parse(raw) as RedirectRecord;
    } catch (error) {
      await this.incrementError();
      this.logger.warn(`redirect_cache_read_failed ${this.message(error)}`);
      return undefined;
    }
  }

  async set(code: string, record: RedirectRecord) {
    if (process.env.REDIRECT_CACHE_ENABLED === 'false') return;
    let ttl = Number(process.env.CACHE_MAX_TTL_SECONDS || 3600);
    if (record.expiresAt) ttl = Math.min(ttl, Math.floor((new Date(record.expiresAt).getTime() - Date.now()) / 1000));
    if (ttl <= 0) return;
    try { await this.redis.client.set(`${PREFIX}${code}`, JSON.stringify(record), 'EX', ttl); }
    catch (error) { await this.incrementError(); this.logger.warn(`redirect_cache_write_failed ${this.message(error)}`); }
  }

  async invalidate(code: string) {
    try { await this.redis.client.del(`${PREFIX}${code}`); }
    catch (error) { await this.incrementError(); this.logger.warn(`redirect_cache_invalidation_failed ${this.message(error)}`); }
  }

  private async incrementError() { try { await this.redis.client.incr('shortlink:metrics:cache:errors'); } catch { /* redis is already unavailable */ } }
  private message(error: unknown) { return error instanceof Error ? error.message : 'unknown'; }
}
