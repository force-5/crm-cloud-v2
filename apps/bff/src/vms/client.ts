import type { FastifyBaseLogger } from 'fastify';
import { ERROR_CODES } from '@crm/contracts';
import { z } from 'zod';
import { AppError, serviceUnavailable } from '../errors';

export type VmsContext = {
  /** Keycloak access token (absent for VMS's public endpoints). */
  token?: string;
  requestId: string;
  userAgent?: string;
};

export type QueryValue = string | number | boolean | undefined | null | (string | number)[];
export type VmsQuery = Record<string, QueryValue>;

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RequestOptions<S extends z.ZodType | undefined> = {
  query?: VmsQuery;
  /** JSON body. */
  json?: unknown;
  /** Raw text body (VMS image endpoints take `@RequestBody String`). */
  raw?: string;
  /** Validates the 2xx response. Omit to ignore the body. */
  schema?: S;
};

type Result<S> = S extends z.ZodType ? z.output<S> : undefined;

/** VMS ApiError: `{code, message, timestamp, correlationId, errors?: [{field, message}]}` */
const vmsErrorBody = z
  .object({
    code: z.string().nullish(),
    message: z.string().nullish(),
    error: z.string().nullish(),
    correlationId: z.string().nullish(),
    errors: z.array(z.object({ field: z.string().nullish(), message: z.string().nullish() })).nullish(),
  })
  .partial();

/** Field names we let through from VMS validation errors: plain identifiers only. */
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
/** Per-field VMS messages are short validator texts ("must not be blank"); cap them anyway. */
const clip = (m: string) => (m.length > 120 ? `${m.slice(0, 117)}…` : m);

/**
 * Turn a VMS error response into the BFF envelope, passing the HTTP status through.
 * VMS's own top-level message is NOT forwarded: it can carry internals such as database column names
 * ("Data too long for column 'name'"), entity names, or whether a record exists (review L3). Users get a
 * fixed message per status, plus per-field messages for allow-listed field names.
 */
export function mapVmsError(status: number, body: unknown): AppError {
  const parsed = vmsErrorBody.safeParse(body);
  const b = parsed.success ? parsed.data : {};
  const fieldErrors: Record<string, string> = {};
  for (const e of b.errors ?? []) {
    if (e.field && FIELD_NAME.test(e.field)) fieldErrors[e.field] ??= clip(e.message ?? 'Invalid value');
  }
  switch (status) {
    case 400:
    case 422:
      return new AppError(400, ERROR_CODES.VALIDATION, 'Please correct the highlighted fields.', fieldErrors);
    case 401:
      return new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Your session has expired. Please sign in again.');
    case 403:
      return new AppError(403, ERROR_CODES.FORBIDDEN, 'You do not have permission to do that.');
    case 404:
      return new AppError(404, ERROR_CODES.NOT_FOUND, 'That record could not be found.');
    case 409:
      return new AppError(409, ERROR_CODES.CONFLICT, 'That change conflicts with existing data, or the record is in use.');
    case 429:
      return new AppError(429, ERROR_CODES.RATE_LIMITED, 'Too many requests. Please wait and try again.');
    default:
      return new AppError(
        status >= 500 && status <= 599 ? status : 502,
        status === 503 ? ERROR_CODES.SERVICE_UNAVAILABLE : ERROR_CODES.INTERNAL,
        status === 503 ? 'Service unavailable' : 'The server could not complete the request. Please try again.',
      );
  }
}

export class VmsClient {
  constructor(
    private readonly cfg: { baseUrl: string; appId: string; timeoutMs: number },
    private readonly log: FastifyBaseLogger,
  ) {}

  async request<S extends z.ZodType | undefined = undefined>(
    ctx: VmsContext,
    method: Method,
    path: string,
    opts: RequestOptions<S> = {},
  ): Promise<Result<S>> {
    const url = new URL(path.replace(/^\/+/, ''), this.cfg.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
      else url.searchParams.set(k, String(v));
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-App-Id': this.cfg.appId,
      'X-Request-Id': ctx.requestId,
      'X-Correlation-Id': ctx.requestId,
    };
    if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`;
    if (ctx.userAgent) headers['User-Agent'] = ctx.userAgent;
    let body: string | undefined;
    if (opts.raw !== undefined) {
      headers['Content-Type'] = 'text/plain;charset=UTF-8';
      body = opts.raw;
    } else if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.cfg.timeoutMs) });
    } catch (err) {
      this.log.error({ err, method, path: url.pathname, reqId: ctx.requestId }, 'VMS unreachable');
      throw serviceUnavailable();
    }
    const text = await res.text().catch(() => '');
    this.log.debug({ method, path: url.pathname, status: res.status, ms: Date.now() - started }, 'vms call');

    let json: unknown = undefined;
    if (text.trim()) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }

    if (!res.ok) {
      // Log the VMS error code and correlation id (to find it in VMS logs), never the body: it can echo
      // user input or internals (review L3).
      const eb = vmsErrorBody.safeParse(json);
      this.log.warn(
        { method, path: url.pathname, status: res.status, vmsCode: eb.success ? eb.data.code : undefined, correlationId: eb.success ? eb.data.correlationId : undefined },
        'VMS error',
      );
      throw mapVmsError(res.status, json);
    }
    if (!opts.schema) return undefined as Result<S>;
    const parsed = opts.schema.safeParse(json);
    if (!parsed.success) {
      this.log.error(
        { method, path: url.pathname, issues: parsed.error.issues.slice(0, 5) },
        'Unexpected VMS response shape',
      );
      throw new AppError(502, ERROR_CODES.INTERNAL, 'Received an unexpected response from the server.');
    }
    return parsed.data as Result<S>;
  }

  /** Bind a context so adapters can call `vms.get(path, opts)` without threading the token around. */
  bind(ctx: VmsContext): Vms {
    const call =
      (method: Method) =>
      <S extends z.ZodType | undefined = undefined>(path: string, opts?: RequestOptions<S>) =>
        this.request<S>(ctx, method, path, opts);
    return { ctx, get: call('GET'), post: call('POST'), put: call('PUT'), patch: call('PATCH'), delete: call('DELETE') };
  }
}

type Call = <S extends z.ZodType | undefined = undefined>(path: string, opts?: RequestOptions<S>) => Promise<Result<S>>;
export type Vms = { ctx: VmsContext; get: Call; post: Call; put: Call; patch: Call; delete: Call };
