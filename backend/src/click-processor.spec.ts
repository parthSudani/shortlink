import { persistClickBatch } from './infrastructure/clicks/click-processor';
import { ClickEvent } from './models/click-event.model';

describe('click batch persistence', () => {
  const events: any[] = [
    { id: 'e1', linkId: 'link-1', clickedAt: '2026-10-14T10:00:00.000Z', referrerHost: null, device: 'unknown' },
    { id: 'e2', linkId: 'link-1', clickedAt: '2026-10-14T10:01:00.000Z', referrerHost: 'example.com', device: 'desktop' },
  ];
  it('bulk inserts unique events and aggregates only returned inserts', async () => {
    const tx: any = {};
    const sequelize: any = { transaction: jest.fn((callback: Function) => callback(tx)), query: jest.fn().mockResolvedValue([]) };
    const original = ClickEvent.bulkCreate;
    ClickEvent.bulkCreate = jest.fn().mockResolvedValue(events.map(event => ({ ...event, clickedAt: new Date(event.clickedAt) }))) as any;
    try {
      await expect(persistClickBatch(sequelize, events)).resolves.toBe(2);
      expect(ClickEvent.bulkCreate).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'e1', idempotencyKey: 'e1' })]), expect.objectContaining({ ignoreDuplicates: true, returning: true, transaction: tx }));
      expect(sequelize.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (link_id, day)'), expect.objectContaining({ replacements: { linkId: 'link-1', day: '2026-10-14', count: 2 }, transaction: tx }));
    } finally { ClickEvent.bulkCreate = original; }
  });
  it('does not update aggregates when all events were duplicate IDs', async () => {
    const sequelize: any = { transaction: jest.fn((callback: Function) => callback({})), query: jest.fn() };
    const original = ClickEvent.bulkCreate;
    ClickEvent.bulkCreate = jest.fn().mockResolvedValue([]) as any;
    try { await expect(persistClickBatch(sequelize, events)).resolves.toBe(0); expect(sequelize.query).not.toHaveBeenCalled(); }
    finally { ClickEvent.bulkCreate = original; }
  });
});
