import { createApi, ApiClientError } from '@crm/api-client';
import { ERROR_CODES } from '@crm/contracts';
import { API_URL } from './config';

let unauthorizedHandler: (() => void) | null = null;

/** The session provider registers what happens on any 401 (clear cache → login). */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

/**
 * Single typed BFF client. The BFF session is an httpOnly cookie that React Native's
 * native cookie store keeps (the client sends `credentials: 'include'`); the CSRF
 * header is handled inside the client.
 */
export const api = createApi({
  baseUrl: API_URL,
  onUnauthorized: () => unauthorizedHandler?.(),
});

export { ApiClientError };

/** Human message for any thrown error. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (err instanceof ApiClientError) return err.message || fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export function isApiError(err: unknown, code?: string): err is ApiClientError {
  return err instanceof ApiClientError && (code === undefined || err.code === code);
}

export function isUnauthenticated(err: unknown): boolean {
  return err instanceof ApiClientError && (err.status === 401 || err.code === ERROR_CODES.UNAUTHENTICATED);
}
