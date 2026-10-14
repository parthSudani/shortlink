import { Sequelize } from 'sequelize-typescript';
import { Transaction } from 'sequelize';
import { ClickEvent } from '../../models/click-event.model';
import { ClickEvent as QueueClickEvent } from './click-queue.service';

export async function persistClickBatch(sequelize: Pick<Sequelize, 'transaction' | 'query'>, events: QueueClickEvent[]) {
  if (!events.length) return 0;
  return sequelize.transaction(async (transaction: Transaction) => {
    const inserted = await ClickEvent.bulkCreate(events.map(event => ({
      id: event.id, linkId: event.linkId, clickedAt: new Date(event.clickedAt),
      referrerHost: event.referrerHost, device: event.device, idempotencyKey: event.id,
    })), { ignoreDuplicates: true, returning: true, transaction });
    const increments = new Map<string, { linkId: string; day: string; count: number }>();
    for (const row of inserted) {
      const day = row.clickedAt.toISOString().slice(0, 10);
      const key = `${row.linkId}:${day}`;
      const aggregate = increments.get(key) || { linkId: row.linkId, day, count: 0 };
      aggregate.count++;
      increments.set(key, aggregate);
    }
    for (const aggregate of increments.values()) {
      await sequelize.query(
        `INSERT INTO daily_link_stats (link_id, day, clicks) VALUES (:linkId, :day, :count)
         ON CONFLICT (link_id, day) DO UPDATE SET clicks = daily_link_stats.clicks + EXCLUDED.clicks`,
        { replacements: aggregate, transaction },
      );
    }
    return inserted.length;
  });
}
