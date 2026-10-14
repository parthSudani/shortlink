import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RedisConnectionService } from './redis-connection.service';

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  constructor(private readonly redis: RedisConnectionService) {}

  async checkLinkCreation(ownerId: string, ip: string) {
    try {
      const key = `shortlink:rate:${ownerId}:${ip}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, Number(process.env.RATE_LIMIT_WINDOW_SECONDS || 60));
      if (count > Number(process.env.RATE_LIMIT_MAX || 20)) throw new Error('RATE_LIMIT');
    } catch (error) {
      if (error instanceof Error && error.message === 'RATE_LIMIT') throw error;
      this.logger.warn('rate_limit_redis_unavailable single-instance request limits are not enforced');
    }
  }

  async checkLoginAttempt(ip: string) {
    try {
      const key = `shortlink:rate:login:${createHash('sha256').update(ip || 'unknown').digest('hex')}`;
      const count = Number(await this.redis.client.get(key) || 0);
      if (count >= Number(process.env.LOGIN_RATE_LIMIT_MAX || 10)) throw new Error('LOGIN_RATE_LIMIT');
    } catch (error) {
      if (error instanceof Error && error.message === 'LOGIN_RATE_LIMIT') throw error;
      this.logger.warn('login_rate_limit_redis_unavailable login limits are not enforced');
    }
  }

  async recordLoginFailure(ip: string) {
    try {
      const key = `shortlink:rate:login:${createHash('sha256').update(ip || 'unknown').digest('hex')}`;
      const count = await this.redis.client.incr(key);
      if (count === 1) await this.redis.client.expire(key, Number(process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS || 900));
    } catch {
      this.logger.warn('login_rate_limit_redis_unavailable failed login could not be counted');
    }
  }
}
