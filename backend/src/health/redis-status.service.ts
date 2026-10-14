import { Injectable } from '@nestjs/common';
import { ClickQueueService } from '../infrastructure/clicks/click-queue.service';
import { RedisConnectionService } from '../infrastructure/redis/redis-connection.service';

@Injectable()
export class RedisStatusService {
  constructor(private readonly redis: RedisConnectionService, private readonly clicks: ClickQueueService) {}

  async check() {
    await this.redis.client.ping();
    const workerHeartbeat = await this.redis.client.get('shortlink:worker:heartbeat');
    return { status: 'ok', dependencies: { redis: 'ok', worker: workerHeartbeat ? 'ok' : 'stale' } };
  }

  async metrics() {
    const queue = await this.clicks.metrics();
    const cache = await this.redis.client.mget('shortlink:metrics:cache:hits', 'shortlink:metrics:cache:misses', 'shortlink:metrics:cache:errors');
    return { cache: { hits: Number(cache[0] || 0), misses: Number(cache[1] || 0), errors: Number(cache[2] || 0) }, queue };
  }
}
