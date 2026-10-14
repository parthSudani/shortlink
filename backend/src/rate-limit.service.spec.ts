import { RateLimitService } from './infrastructure/redis/rate-limit.service';

describe('RateLimitService', () => {
  const previous = { max: process.env.RATE_LIMIT_MAX, window: process.env.RATE_LIMIT_WINDOW_SECONDS };
  afterEach(() => {
    if (previous.max === undefined) delete process.env.RATE_LIMIT_MAX; else process.env.RATE_LIMIT_MAX = previous.max;
    if (previous.window === undefined) delete process.env.RATE_LIMIT_WINDOW_SECONDS; else process.env.RATE_LIMIT_WINDOW_SECONDS = previous.window;
  });

  it('sets expiry on the first creation request and allows it under the limit', async () => {
    process.env.RATE_LIMIT_MAX = '2';
    process.env.RATE_LIMIT_WINDOW_SECONDS = '45';
    const client: any = { incr: jest.fn().mockResolvedValue(1), expire: jest.fn().mockResolvedValue(1) };
    await new RateLimitService({ client } as any).checkLinkCreation('user-1', '203.0.113.2');
    expect(client.incr).toHaveBeenCalledWith('shortlink:rate:user-1:203.0.113.2');
    expect(client.expire).toHaveBeenCalledWith('shortlink:rate:user-1:203.0.113.2', 45);
  });

  it('rejects requests after the per-owner and IP threshold', async () => {
    process.env.RATE_LIMIT_MAX = '1';
    const client: any = { incr: jest.fn().mockResolvedValue(2), expire: jest.fn() };
    await expect(new RateLimitService({ client } as any).checkLinkCreation('u', 'ip')).rejects.toThrow('RATE_LIMIT');
    expect(client.expire).not.toHaveBeenCalled();
  });

  it('fails open if Redis is unavailable', async () => {
    const client: any = { incr: jest.fn().mockRejectedValue(new Error('redis offline')) };
    const service = new RateLimitService({ client } as any);
    const logger = jest.spyOn((service as any).logger, 'warn').mockImplementation();
    await expect(service.checkLinkCreation('u', 'ip')).resolves.toBeUndefined();
    expect(logger).toHaveBeenCalled();
  });
});
