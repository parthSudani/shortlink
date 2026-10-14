import { ApiErrorFilter } from './common/filters/api-error.filter';

describe('ApiErrorFilter', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation();
  afterAll(() => consoleError.mockRestore());
  function response() {
    const headers: Record<string, string> = {};
    const res: any = { statusCode: 0, body: undefined, status(code: number) { this.statusCode = code; return this; }, json(body: any) { this.body = body; return this; }, setHeader(key: string, value: string) { headers[key] = value; } };
    const req: any = { headers: { 'x-request-id': 'req-123' }, path: '/api/v1/links' };
    const host: any = { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) };
    return { res, headers, host };
  }

  it.each([
    ['INVALID_DESTINATION', 400, 'INVALID_DESTINATION'],
    ['INVALID_ALIAS', 400, 'VALIDATION_ERROR'],
    ['INVALID_EXPIRY', 400, 'VALIDATION_ERROR'],
    ['INVALID_PAGINATION', 400, 'VALIDATION_ERROR'],
    ['INVALID_ANALYTICS_QUERY', 400, 'VALIDATION_ERROR'],
    ['NOT_FOUND', 404, 'NOT_FOUND'],
    ['UNAUTHORIZED', 401, 'INVALID_CREDENTIALS'],
    ['RATE_LIMIT', 429, 'RATE_LIMITED'],
    ['LOGIN_RATE_LIMIT', 429, 'LOGIN_RATE_LIMITED'],
    ['CODE_COLLISION', 503, 'CODE_GENERATION_FAILED'],
  ])('maps %s to HTTP %s', (message, status, code) => {
    const { res, host } = response();
    new ApiErrorFilter().catch(new Error(message), host);
    expect(res.statusCode).toBe(status);
    expect(res.body).toMatchObject({ statusCode: status, code, requestId: 'req-123' });
  });

  it('does not expose internal exception messages to clients', () => {
    const { res, host } = response();
    new ApiErrorFilter().catch(new Error('database password leaked'), host);
    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({ code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });
});
