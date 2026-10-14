import 'reflect-metadata';
import { hostname } from 'node:os';
import { Sequelize } from 'sequelize-typescript';
import { persistClickBatch } from './click-processor';
import { ClickQueueService } from './click-queue.service';
import { RedisConnectionService } from './redis-connection.service';
import { ClickEvent } from './models/click-event.model';
import { DailyLinkStat } from './models/daily-link-stat.model';
import { Link } from './models/link.model';
import { User } from './models/user.model';
import { postgresOptions } from './database-options';

const redis = new RedisConnectionService();
const queue = new ClickQueueService(redis);
const sequelize = new Sequelize({ ...postgresOptions(), models: [User, Link, ClickEvent, DailyLinkStat] });
const workerName = `${hostname()}-${process.pid}`;
let stopping = false;
let consumersDone: Promise<void> | undefined;

async function consume(consumer: string) {
  while (!stopping) {
    try {
      await queue.requeueDue(Number(process.env.QUEUE_BATCH_SIZE || 100));
      const records = await queue.readBatch(consumer, Number(process.env.QUEUE_BATCH_SIZE || 100));
      if (!records.length) continue;
      try {
        await persistClickBatch(sequelize, records.map(record => record.event));
        await queue.acknowledge(records.map(record => record.streamId));
      } catch (error) {
        for (const record of records) {
          try { await queue.retryOrDeadLetter(record.streamId, record.event, record.event.attempt || 1, error); }
          catch (retryError) { console.error(JSON.stringify({ event: 'click_retry_schedule_failed', eventId: record.event.id, message: message(retryError) })); }
        }
        await queue.recordWorkerFailure().catch(() => undefined);
      }
    } catch (error) {
      if (!stopping) {
        console.error(JSON.stringify({ event: 'click_worker_loop_failed', consumer, message: message(error) }));
        await queue.recordWorkerFailure().catch(() => undefined);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

async function bootstrap() {
  await sequelize.authenticate();
  await queue.ensureGroup();
  const heartbeat = async () => redis.client.set('shortlink:worker:heartbeat', String(Date.now()), 'EX', Number(process.env.WORKER_HEARTBEAT_TTL_SECONDS || 30));
  await heartbeat();
  const timer = setInterval(() => { void heartbeat().catch(() => undefined); }, Math.max(1000, Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 5000)));
  timer.unref();
  const concurrency = Math.max(1, Number(process.env.QUEUE_WORKER_CONCURRENCY || 4));
  console.info(JSON.stringify({ event: 'click_worker_started', workerName, concurrency }));
  consumersDone = Promise.all(Array.from({ length: concurrency }, (_, i) => consume(`${workerName}-${i}`))).then(() => undefined);
  await consumersDone;
  clearInterval(timer);
}

async function shutdown() {
  if (stopping) return;
  stopping = true;
  await consumersDone;
  await redis.close();
  await sequelize.close();
}
function message(error: unknown) { return error instanceof Error ? error.message : 'unknown'; }
void bootstrap().catch(async error => { console.error(JSON.stringify({ event: 'worker_start_failed', message: message(error) })); process.exitCode = 1; await shutdown(); });
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
