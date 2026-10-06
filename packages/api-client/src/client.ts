import { CSRF_HEADER, ERROR_CODES, type ApiError } from '@crm/contracts';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export type ApiClientOptions = {
  /** e.g. `/crm/api` on web, `https://crm.force5-dev.com/crm/api` on mobile. */
  baseUrl: string;
  /** Called on any 401 (session expired / not signed in). */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
};

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Query = Record<string, string | number | boolean | undefined | null>;

/**
 * Thin fetch wrapper shared by web and mobile. Relies on the BFF session cookie
 * (`credentials: 'include'`; React Native's native cookie jar handles it on mobile)
 * and attaches the CSRF token to every mutating request.
 */
export class HttpClient {
  private csrfToken: string | null = null;
  private csrfPromise: Promise<string> | null = null;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: ApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? ((...args) => fetch(...args));
  }

  setCsrfToken(token: string | null) {
    this.csrfToken = token;
  }

  get<T>(path: string, query?: Query) {
    return this.request<T>('GET', path, undefined, query);
  }
  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }
  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }
  patch<T>(path: string, body?: unknown) {
    return this.request<T>('PATCH', path, body);
  }
  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }

  private async ensureCsrf(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    this.csrfPromise ??= this.request<{ csrfToken: string }>('GET', '/auth/csrf')
      .then((r) => (this.csrfToken = r.csrfToken))
      .finally(() => (this.csrfPromise = null));
    return this.csrfPromise;
  }

  private async request<T>(method: Method, path: string, body?: unknown, query?: Query, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers[CSRF_HEADER] = await this.ensureCsrf();

    let res: Response;
    try {
      res = await this.fetchImpl(this.opts.baseUrl + path + toQueryString(query), {
        method,
        headers,
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiClientError(0, ERROR_CODES.SERVICE_UNAVAILABLE, 'Unable to reach the server. Check your connection.');
    }

    if (res.status === 204) return undefined as T;
    const payload = await res.json().catch(() => undefined);
    if (res.ok) return payload as T;

    const err = (payload as ApiError | undefined)?.error;
    const code = err?.code ?? (res.status === 401 ? ERROR_CODES.UNAUTHENTICATED : ERROR_CODES.INTERNAL);

    // Token rotated (new session after login, or expired) — fetch a fresh one and retry once.
    if (code === ERROR_CODES.CSRF && !retried) {
      this.csrfToken = null;
      return this.request<T>(method, path, body, query, true);
    }
    if (res.status === 401) {
      this.csrfToken = null;
      this.opts.onUnauthorized?.();
    }
    throw new ApiClientError(res.status, code, err?.message ?? 'Something went wrong', err?.fieldErrors);
  }
}

function toQueryString(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}
