import { JwtService } from '@nestjs/jwt';
import { UniqueConstraintError } from 'sequelize';
import * as argon2 from 'argon2';
import { AppService } from './app.service';
import { AuthGuard } from './app.controller';
import { RateLimitService } from './rate-limit.service';
import { getAuthConfig } from './auth-config';

const secret = 'test-secret-that-is-long-enough-for-jwt';
const issuer = 'test-api';
const audience = 'test-dashboard';

function context(authorization?: string) {
  const request: any = { headers: authorization ? { authorization } : {}, user: undefined };
  return { request, execution: { switchToHttp: () => ({ getRequest: () => request }) } };
}

describe('authentication security', () => {
  let jwt: JwtService;
  beforeEach(() => {
    jwt = new JwtService({ secret, signOptions: { expiresIn: 900, issuer, audience, algorithm: 'HS256' }, verifyOptions: { issuer, audience, algorithms: ['HS256'] } });
  });

  it('requires a configured signing secret and caps access tokens at one hour', () => {
    expect(() => getAuthConfig({} as NodeJS.ProcessEnv)).toThrow('JWT_SECRET');
    expect(() => getAuthConfig({ JWT_SECRET: secret, JWT_EXPIRES_IN: '2h' } as NodeJS.ProcessEnv)).toThrow('JWT_EXPIRES_IN');
    expect(getAuthConfig({ JWT_SECRET: secret } as NodeJS.ProcessEnv)).toMatchObject({ expiresInSeconds: 900, issuer: 'shortlink-api', audience: 'shortlink-dashboard' });
  });

  it('registers normalized email with an Argon2id hash and returns no hash', async () => {
    const users: any = { create: jest.fn(async (data: any) => ({ id: 'user-1', email: data.email, passwordHash: data.passwordHash })) };
    const service = new AppService({} as any, users, {} as any, jwt, {} as any, {} as any, { checkLoginAttempt: jest.fn(), recordLoginFailure: jest.fn() } as any);
    const result = await service.register(' Person@Example.com ', 'a-long-password');
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'person@example.com' }));
    const hash = users.create.mock.calls[0][0].passwordHash;
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await argon2.verify(hash, 'a-long-password')).toBe(true);
    expect(JSON.stringify(result)).not.toContain(hash);
    expect(jwt.verify(result.accessToken)).toMatchObject({ sub: 'user-1', iss: issuer, aud: audience });
  });

  it('rejects duplicate normalized emails with a generic conflict', async () => {
    const users: any = { create: jest.fn().mockRejectedValue(new UniqueConstraintError({ message: 'duplicate email' })) };
    const service = new AppService({} as any, users, {} as any, jwt, {} as any, {} as any, {} as any);
    await expect(service.register(' PERSON@example.com ', 'a-long-password')).rejects.toThrow('Email already registered');
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'person@example.com' }));
  });

  it('logs in with normalized email and verifies the Argon2id password', async () => {
    const hash = await argon2.hash('a-long-password', { type: argon2.argon2id });
    const users: any = { findOne: jest.fn().mockResolvedValue({ id: 'user-2', email: 'person@example.com', passwordHash: hash }) };
    const rateLimit: any = { checkLoginAttempt: jest.fn(), recordLoginFailure: jest.fn() };
    const service = new AppService({} as any, users, {} as any, jwt, {} as any, {} as any, rateLimit);
    const result = await service.login(' PERSON@example.com ', 'a-long-password', '203.0.113.4');
    expect(users.findOne).toHaveBeenCalledWith({ where: { email: 'person@example.com' } });
    expect(rateLimit.checkLoginAttempt).toHaveBeenCalledWith('203.0.113.4');
    expect(result.user).toEqual({ id: 'user-2', email: 'person@example.com' });
    expect(jwt.verify(result.accessToken).sub).toBe('user-2');
  });

  it('returns the same invalid-credentials error for unknown emails and wrong passwords', async () => {
    const rateLimit: any = { checkLoginAttempt: jest.fn(), recordLoginFailure: jest.fn() };
    const unknown = new AppService({} as any, { findOne: jest.fn().mockResolvedValue(null) } as any, {} as any, jwt, {} as any, {} as any, rateLimit);
    const wrong = new AppService({} as any, { findOne: jest.fn().mockResolvedValue({ passwordHash: await argon2.hash('correct-password') }) } as any, {} as any, jwt, {} as any, {} as any, rateLimit);
    await expect(unknown.login('none@example.com', 'bad-password', 'ip')).rejects.toThrow('UNAUTHORIZED');
    await expect(wrong.login('person@example.com', 'bad-password', 'ip')).rejects.toThrow('UNAUTHORIZED');
    expect(rateLimit.recordLoginFailure).toHaveBeenCalledTimes(2);
  });

  it('rejects missing, malformed, expired, and wrong-audience tokens', async () => {
    const guard = new AuthGuard(jwt);
    for (const authorization of [undefined, 'Basic token', 'Bearer malformed']) {
      const { execution } = context(authorization);
      await expect(guard.canActivate(execution)).rejects.toThrow();
    }
    const expired = jwt.sign({ sub: 'u' }, { expiresIn: -1 });
    await expect(guard.canActivate(context(`Bearer ${expired}`).execution)).rejects.toThrow();
    const otherAudience = new JwtService({ secret, signOptions: { expiresIn: 60, issuer, audience: 'other', algorithm: 'HS256' } }).sign({ sub: 'u' });
    await expect(guard.canActivate(context(`Bearer ${otherAudience}`).execution)).rejects.toThrow();
    const valid = jwt.sign({ sub: 'u' });
    const { execution, request } = context(`Bearer ${valid}`);
    await expect(guard.canActivate(execution)).resolves.toBe(true);
    expect(request.user.sub).toBe('u');
  });

  it('blocks login attempts after the configured per-IP limit', async () => {
    const client: any = { get: jest.fn().mockResolvedValue('10') };
    const limits = new RateLimitService({ client } as any);
    process.env.LOGIN_RATE_LIMIT_MAX = '10';
    await expect(limits.checkLoginAttempt('203.0.113.8')).rejects.toThrow('LOGIN_RATE_LIMIT');
    expect(client.get).toHaveBeenCalledWith(expect.stringMatching(/^shortlink:rate:login:[a-f0-9]{64}$/));
  });

  it('passes only the verified subject to link ownership lookups', async () => {
    const valid = jwt.sign({ sub: 'owner-from-token' });
    const { execution, request } = context(`Bearer ${valid}`);
    await new AuthGuard(jwt).canActivate(execution);
    const service: any = { listLinks: jest.fn().mockResolvedValue({ items: [] }) };
    const { LinksController } = await import('./app.controller');
    await new LinksController(service).list(request, '0', '20', 'createdAt');
    expect(service.listLinks).toHaveBeenCalledWith('owner-from-token', 0, 20, 'createdAt');
  });
});
