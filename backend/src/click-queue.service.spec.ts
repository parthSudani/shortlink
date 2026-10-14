import { ClickQueueService } from './infrastructure/clicks/click-queue.service';

describe('Redis click queue', () => {
  function setup() {
    const transaction: any = {};
    for (const method of ['xadd', 'incr', 'zadd', 'xack', 'xdel']) transaction[method] = jest.fn().mockReturnValue(transaction);
    transaction.exec = jest.fn().mockResolvedValue([]);
    const client: any = {
      multi: jest.fn(() => transaction), incr: jest.fn(), xadd: jest.fn(), xack: jest.fn(), xdel: jest.fn(),
      xlen: jest.fn().mockResolvedValue(0), xpending: jest.fn().mockResolvedValue([0]), zcard: jest.fn().mockResolvedValue(0),
      get: jest.fn().mockResolvedValue(null), xrange: jest.fn().mockResolvedValue([]), zrange: jest.fn().mockResolvedValue([]),
    };
    const service = new ClickQueueService({ client } as any);
    return { service, client, transaction };
  }

  it('enqueues uniquely identified events in the Redis stream', async () => {
    const { service, client, transaction } = setup();
    await expect(service.enqueue({ linkId: 'link-1', clickedAt: '2026-10-14T10:00:00.000Z', referrerHost: null, device: 'unknown' })).resolves.toBe(true);
    expect(client.multi).toHaveBeenCalled();
    const serialized = transaction.xadd.mock.calls[0][3];
    expect(JSON.parse(serialized)).toEqual(expect.objectContaining({ id: expect.any(String), linkId: 'link-1' }));
  });

  it('fails open when Redis cannot accept a click and records the local dropped count', async () => {
    const { service, client } = setup();
    client.multi.mockImplementation(() => { throw new Error('offline'); });
    client.incr.mockRejectedValue(new Error('offline'));
    await expect(service.enqueue({ linkId: 'link-1', clickedAt: new Date().toISOString(), referrerHost: null, device: 'unknown' })).resolves.toBe(false);
    await expect(service.metrics()).resolves.toEqual(expect.objectContaining({ dropped: 1 }));
    expect(client.incr).toHaveBeenCalledWith('shortlink:metrics:queue:dropped');
  });

  it('moves exhausted events to the dead-letter stream and removes pending work atomically', async () => {
    const { service, transaction } = setup();
    const previous = process.env.QUEUE_MAX_ATTEMPTS;
    process.env.QUEUE_MAX_ATTEMPTS = '1';
    try {
      await service.retryOrDeadLetter('12-0', { id: 'event-1', linkId: 'link-1', clickedAt: new Date().toISOString(), referrerHost: null, device: 'unknown' }, 1, new Error('database down'));
      expect(transaction.xadd).toHaveBeenCalled();
      expect(transaction.xack).toHaveBeenCalled();
      expect(transaction.xdel).toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.QUEUE_MAX_ATTEMPTS; else process.env.QUEUE_MAX_ATTEMPTS = previous; }
  });
});
