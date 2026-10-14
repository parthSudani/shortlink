import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { UniqueConstraintError } from 'sequelize';
import { Request, Response } from 'express';
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp(), req = ctx.getRequest<Request>(), res = ctx.getResponse<Response>();
    let status = error?.status || (error instanceof HttpException ? error.getStatus() : 500);
    let code = error?.message || 'INTERNAL_ERROR', message = 'Request failed', details: any[] = [];
    if (code === 'VALIDATION_ERROR') { status = 400; message = 'Request validation failed'; details = error.details || []; }
    else if (code === 'UNAUTHORIZED') { status = 401; code = 'INVALID_CREDENTIALS'; message = 'Invalid email or password'; }
    else if (code === 'NOT_FOUND') { status = 404; code = 'NOT_FOUND'; message = 'Resource not found'; }
    else if (code === 'RATE_LIMIT') { status = 429; code = 'RATE_LIMITED'; message = 'Too many link creations'; res.setHeader('Retry-After', process.env.RATE_LIMIT_WINDOW_SECONDS || '60'); }
    else if (code === 'LOGIN_RATE_LIMIT') { status = 429; code = 'LOGIN_RATE_LIMITED'; message = 'Too many login attempts. Try again later'; res.setHeader('Retry-After', process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS || '900'); }
    else if (code === 'INVALID_ALIAS' || code === 'INVALID_EXPIRY' || code === 'INVALID_PAGINATION' || code === 'INVALID_ANALYTICS_QUERY') { status = 400; code = 'VALIDATION_ERROR'; message = 'Request validation failed'; }
    else if (code === 'CODE_COLLISION') { status = 503; code = 'CODE_GENERATION_FAILED'; message = 'Could not allocate a short code'; }
    else if (code === 'INVALID_DESTINATION') { status = 400; code = 'INVALID_DESTINATION'; message = 'Destination must be a public HTTP or HTTPS URL without credentials'; }
    else if (error instanceof UniqueConstraintError) { status = 409; code = 'CONFLICT'; message = 'Email or alias is already in use'; }
    else if (error instanceof HttpException) { const body: any = error.getResponse(); status = error.getStatus(); code = body?.error?.toUpperCase?.() || 'HTTP_ERROR'; message = typeof body === 'string' ? body : body?.message || 'Request failed'; }
    if (status >= 500) { code = 'INTERNAL_ERROR'; message = 'An unexpected error occurred'; console.error(JSON.stringify({ event: 'api_error', requestId: req.headers['x-request-id'], path: req.path, error: error?.message })); }
    res.status(status).json({ statusCode: status, code, message, ...(details.length ? { details } : {}), requestId: req.headers['x-request-id'] || undefined });
  }
}
