import { ApiClientError } from '@crm/api-client';
import { ERROR_CODES } from '@crm/contracts';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import i18n from './i18n';

export function isApiError(err: unknown): err is ApiClientError {
  return err instanceof ApiClientError;
}

/** User-facing message for any thrown error. Never invents success. */
export function errorMessage(err: unknown): string {
  if (isApiError(err)) {
    switch (err.code) {
      case ERROR_CODES.SERVICE_UNAVAILABLE:
        return err.status === 0 ? i18n.t('common:errors.network') : i18n.t('common:errors.unavailable');
      case ERROR_CODES.FORBIDDEN:
        return i18n.t('common:errors.forbidden');
      case ERROR_CODES.RATE_LIMITED:
        return i18n.t('common:errors.rateLimited');
      case ERROR_CODES.NOT_FOUND:
        return err.message || i18n.t('common:errors.notFound');
      default:
        return err.message || i18n.t('common:errors.generic');
    }
  }
  return i18n.t('common:errors.generic');
}

/**
 * Copies BFF `fieldErrors` onto a React Hook Form instance. Returns true when at least one
 * error was mapped to a known field (so callers can skip the generic toast).
 */
export function applyFieldErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): boolean {
  if (!isApiError(err) || !err.fieldErrors) return false;
  let mapped = false;
  for (const [field, message] of Object.entries(err.fieldErrors)) {
    if (knownFields.includes(field)) {
      setError(field as Path<T>, { type: 'server', message }, { shouldFocus: !mapped });
      mapped = true;
    }
  }
  return mapped;
}

export function shouldRetry(failureCount: number, err: unknown): boolean {
  if (isApiError(err) && err.status >= 400 && err.status < 500) return false;
  return failureCount < 2;
}
