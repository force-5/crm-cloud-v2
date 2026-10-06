import { CSRF_HEADER, ERROR_CODES } from '@crm/contracts';
import type { FastifyRequest, Session } from 'fastify';
import { AppError } from '../errors';
import { randomToken, safeEqual } from './crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Synchronizer token: one per session, created on demand (works before login). */
export function ensureCsrfToken(session: Session): string {
  session.csrfToken ??= randomToken(32);
  return session.csrfToken;
}

export function rotateCsrfToken(session: Session): string {
  session.csrfToken = randomToken(32);
  return session.csrfToken;
}

/** Every non-GET `/api` request must echo the session's token in `x-csrf-token`. */
export async function csrfCheck(req: FastifyRequest) {
  if (SAFE_METHODS.has(req.method)) return;
  const header = req.headers[CSRF_HEADER];
  const sent = Array.isArray(header) ? header[0] : header;
  if (!safeEqual(sent, req.session.csrfToken)) {
    throw new AppError(403, ERROR_CODES.CSRF, 'Your security token is missing or expired. Please retry.');
  }
}
