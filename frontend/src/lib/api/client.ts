import type { ErrorDetail, ErrorResponse } from '../../types/api';

const configuredBase = import.meta.env.VITE_API_BASE_URL?.trim();
if (!configuredBase) {
  throw new Error('VITE_API_BASE_URL is missing. Set it in the root .env file or frontend build environment.');
}
let validatedBase: URL;
try { validatedBase = new URL(configuredBase); }
catch { throw new Error('VITE_API_BASE_URL must be an absolute HTTP or HTTPS URL.'); }
if (!['http:', 'https:'].includes(validatedBase.protocol) || validatedBase.username || validatedBase.password) {
  throw new Error('VITE_API_BASE_URL must be an absolute HTTP or HTTPS URL without credentials.');
}
export const API_BASE_URL = configuredBase.replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: ErrorDetail[];
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status: number,
    code: string,
    details: ErrorDetail[] = [],
    retryAfterSeconds?: number,
  ) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; this.retryAfterSeconds = retryAfterSeconds; }
}

let unauthorizedHandler: (() => void) | undefined;
export function setUnauthorizedHandler(handler: () => void) { unauthorizedHandler = handler; }

type RequestOptions = Omit<RequestInit, 'headers'> & { headers?: HeadersInit; authenticated?: boolean };

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { authenticated = true, signal, ...requestOptions } = options;
  const controller = new AbortController();
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), 15000);
  const headers = new Headers(requestOptions.headers);
  if (requestOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');
  if (authenticated) {
    const token = sessionStorage.getItem('accessToken');
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, { ...requestOptions, headers, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as ErrorResponse;
      const retryHeader = response.headers.get('Retry-After');
      const retry = retryHeader ? Number(retryHeader) : undefined;
      const error = new ApiError(
        safeMessage(response.status, body), response.status, body.code || `HTTP_${response.status}`,
        Array.isArray(body.details) ? body.details : [], Number.isFinite(retry) ? retry : undefined,
      );
      if (response.status === 401 && authenticated) unauthorizedHandler?.();
      throw error;
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      if (signal?.aborted) throw error;
      throw new ApiError('The request timed out. Please try again.', 0, 'TIMEOUT');
    }
    throw new ApiError('Unable to reach the service. Check your connection and try again.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', onAbort);
  }
}

function safeMessage(status: number, error: ErrorResponse) {
  if (status >= 500) return 'The service could not complete your request. Try again shortly.';
  if (status === 401) return 'Your session has expired or your credentials are invalid.';
  if (status === 403 || status === 404) return 'This link could not be found or is not available to your account.';
  if (status === 409) return 'That email or custom alias is already in use.';
  if (status === 410) return 'This link has expired.';
  if (status === 429) return 'Too many requests. Please wait before trying again.';
  if (error.code === 'INVALID_DESTINATION') return 'Enter a valid public HTTP or HTTPS destination URL.';
  if (error.code === 'VALIDATION_ERROR') return 'Check the highlighted fields and try again.';
  return error.message && error.message.length < 180 ? error.message : 'The request could not be completed.';
}
