import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RedisConnectionService } from './redis-connection.service';

export type ClickEvent = { id: string; linkId: string; clickedAt: string; referrerHost: string | null; device: string; attempt?: number };
export const CLICK_STREAM = 'shortlink:queue:click-events';
export const CLICK_GROUP = 'shortlink-click-workers';
const RETRIES = 'shortlink:queue:click-retries';
const DEAD = 'shortlink:queue:click-dead-letter';

@Injectable()
export class ClickQueueService {
  private readonly logger = new Logger(ClickQueueService.name);
  private droppedLocal = 0;
  constructor(private readonly redis: RedisConnectionService) {}

  async ensureGroup() {
    try { await this.redis.client.xgroup('CREATE', CLICK_STREAM, CLICK_GROUP, '0', 'MKSTREAM'); }
    catch (error) { if (!(error instanceof Error) || !error.message.includes('BUSYGROUP')) throw error; }
  }

  async enqueue(event: Omit<ClickEvent, 'id'>) {
    const item: ClickEvent = { id: randomUUID(), ...event };
    try {
      await this.redis.client.multi()
        .xadd(CLICK_STREAM, '*', 'event', JSON.stringify(item))
        .incr('shortlink:metrics:queue:enqueued')
        .exec();
      return true;
    } catch (error) {
      try { await this.redis.client.incr('shortlink:metrics:queue:dropped'); } catch { this.droppedLocal++; }
      this.logger.error(`click_event_dropped ${error instanceof Error ? error.message : 'unknown'}`);
      return false;
    }
  }

  async readBatch(consumer: string, count: number) {
    const claimed = await this.redis.client.xautoclaim(CLICK_STREAM, CLICK_GROUP, consumer, Number(process.env.QUEUE_CLAIM_IDLE_MS || 30000), '0-0', 'COUNT', count) as [string, Array<[string, string[]]>, string[]];
    if (claimed[1].length) return this.parseEntries(claimed[1]);
    const result = await this.redis.client.xreadgroup('GROUP', CLICK_GROUP, consumer, 'COUNT', count, 'BLOCK', 1000, 'STREAMS', CLICK_STREAM, '>') as Array<[string, Array<[string, string[]]>]> | null;
    if (!result) return [] as Array<{ streamId: string; event: ClickEvent }>;
    return result.flatMap(([, entries]) => this.parseEntries(entries));
  }

  private parseEntries(entries: Array<[string, string[]]>) {
    return entries.map(([streamId, fields]) => {
      const raw = fields[fields.indexOf('event') + 1];
      return { streamId, event: JSON.parse(raw) as ClickEvent };
    });
  }

  async acknowledge(streamIds: string[]) {
    if (streamIds.length) await this.redis.client.multi().xack(CLICK_STREAM, CLICK_GROUP, ...streamIds).xdel(CLICK_STREAM, ...streamIds).exec();
  }

  async retryOrDeadLetter(streamId: string, event: ClickEvent, attempt: number, error: unknown) {
    const max = Number(process.env.QUEUE_MAX_ATTEMPTS || 8);
    if (attempt >= max) {
      await this.redis.client.multi()
        .xadd(DEAD, '*', 'event', JSON.stringify(event), 'attempts', String(attempt), 'error', this.message(error).slice(0, 500))
        .xack(CLICK_STREAM, CLICK_GROUP, streamId)
        .xdel(CLICK_STREAM, streamId)
        .incr('shortlink:metrics:queue:dead_letter')
        .exec();
      this.logger.error(`click_event_dead_lettered eventId=${event.id} attempts=${attempt}`);
      return;
    }
    const delay = Number(process.env.QUEUE_RETRY_DELAY_MS || 1000) * Math.min(2 ** (attempt - 1), 64);
    const retryEvent = { ...event, attempt: attempt + 1 };
    await this.redis.client.multi()
      .zadd(RETRIES, Date.now() + delay, JSON.stringify({ event: retryEvent, attempt: attempt + 1 }))
      .incr('shortlink:metrics:queue:retries')
      .xack(CLICK_STREAM, CLICK_GROUP, streamId)
      .xdel(CLICK_STREAM, streamId)
      .exec();
  }

  async requeueDue(maxBatch: number) {
    const members = await this.redis.client.zrangebyscore(RETRIES, '-inf', Date.now(), 'LIMIT', 0, maxBatch);
    let moved = 0;
    for (const member of members) {
      const result = await this.redis.client.eval(
        `if redis.call('ZREM',KEYS[1],ARGV[1])==1 then local d=cjson.decode(ARGV[1]); redis.call('XADD',KEYS[2],'*','event',cjson.encode(d['event'])); return 1 end return 0`,
        2, RETRIES, CLICK_STREAM, member,
      );
      moved += Number(result);
    }
    return moved;
  }

  async recordWorkerFailure() { await this.redis.client.incr('shortlink:metrics:worker:failures'); }

  async metrics() {
    const [length, pending, retries, dead, enqueued, dropped, retryCount, failures, first, retryFirst] = await Promise.all([
      this.redis.client.xlen(CLICK_STREAM), this.redis.client.xpending(CLICK_STREAM, CLICK_GROUP).catch(() => null),
      this.redis.client.zcard(RETRIES), this.redis.client.xlen(DEAD), this.redis.client.get('shortlink:metrics:queue:enqueued'),
      this.redis.client.get('shortlink:metrics:queue:dropped'), this.redis.client.get('shortlink:metrics:queue:retries'),
      this.redis.client.get('shortlink:metrics:worker:failures'), this.redis.client.xrange(CLICK_STREAM, '-', '+', 'COUNT', 1),
      this.redis.client.zrange(RETRIES, 0, 0),
    ]);
    const streamId = first[0]?.[0];
    let retryClickedAt = 0;
    try { if (retryFirst[0]) retryClickedAt = Date.parse(JSON.parse(retryFirst[0]).event.clickedAt) || 0; } catch { /* ignore malformed diagnostics entry */ }
    const streamCreatedAt = streamId ? Number(streamId.split('-')[0]) : 0;
    const oldestTimestamp = [streamCreatedAt, retryClickedAt].filter(Boolean).reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
    const oldestEventAgeMs = Number.isFinite(oldestTimestamp) ? Math.max(0, Date.now() - oldestTimestamp) : 0;
    const pendingCount = Array.isArray(pending) ? Number(pending[0]) : 0;
    return { depth: length + retries, streamLength: length, pending: pendingCount, retryScheduled: retries, deadLetter: dead, enqueued: Number(enqueued || 0), dropped: Number(dropped || 0) + this.droppedLocal, retryCount: Number(retryCount || 0), workerFailures: Number(failures || 0), oldestEventAgeMs };
  }

  private message(error: unknown) { return error instanceof Error ? error.message : 'unknown'; }
}
