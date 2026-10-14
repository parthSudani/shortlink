import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisConnectionService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisConnectionService.name);
  readonly client: Redis;

  constructor() {
    this.client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      lazyConnect: true,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
      commandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT_MS || 3000),
      maxRetriesPerRequest: Number(process.env.REDIS_MAX_RETRIES_PER_REQUEST || 1),
      retryStrategy: (attempt) => attempt > Number(process.env.REDIS_RETRY_MAX_ATTEMPTS || 5)
        ? null
        : Math.min(attempt * Number(process.env.REDIS_RETRY_DELAY_MS || 250), 5000),
      enableReadyCheck: true,
    });
    this.client.on('error', error => this.logger.warn(`redis_connection_error ${error.message}`));
  }

  async onApplicationShutdown() {
    await this.close();
  }

  async close() {
    if (this.client.status === 'wait' || this.client.status === 'end') { this.client.disconnect(); return; }
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.client.quit().catch(() => this.client.disconnect()),
        new Promise<void>(resolve => {
          timer = setTimeout(() => { this.client.disconnect(); resolve(); }, Number(process.env.REDIS_SHUTDOWN_TIMEOUT_MS || 3000));
          timer.unref();
        }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
