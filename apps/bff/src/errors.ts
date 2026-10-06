import { ERROR_CODES, type ApiError } from '@crm/contracts';
import type { z } from 'zod';

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Any error the BFF deliberately returns. Rendered as the shared `{ error: {...} }` envelope. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toBody(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.fieldErrors && Object.keys(this.fieldErrors).length ? { fieldErrors: this.fieldErrors } : {}),
      },
    };
  }
}

export const unauthenticated = (message = 'Please sign in to continue.') =>
  new AppError(401, ERROR_CODES.UNAUTHENTICATED, message);
export const forbidden = (message = 'You do not have access to this resource.') =>
  new AppError(403, ERROR_CODES.FORBIDDEN, message);
export const notFound = (message = 'Not found') => new AppError(404, ERROR_CODES.NOT_FOUND, message);
export const serviceUnavailable = (message = 'Service unavailable') =>
  new AppError(503, ERROR_CODES.SERVICE_UNAVAILABLE, message);
export const validationError = (fieldErrors: Record<string, string>, message = 'Please correct the highlighted fields.') =>
  new AppError(400, ERROR_CODES.VALIDATION, message, fieldErrors);

/** Flatten Zod issues into `field → first message`, optionally stripping a leading path segment. */
export function zodFieldErrors(error: z.ZodError, stripPrefix?: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    let path = issue.path.map(String);
    if (stripPrefix && path[0] === stripPrefix) path = path.slice(1);
    const key = path.join('.') || '_';
    out[key] ??= issue.message;
  }
  return out;
}

/** Parse a request body/query with a contracts schema, throwing a 400 VALIDATION AppError on failure. */
export function parseOrThrow<S extends z.ZodType>(schema: S, value: unknown, stripPrefix?: string): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) throw validationError(zodFieldErrors(r.error, stripPrefix));
  return r.data;
}
