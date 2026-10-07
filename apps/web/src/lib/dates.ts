import { formatInTimeZone } from 'date-fns-tz';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './api';
import { queryKeys } from '@crm/api-client';
import type { SessionInfo } from '@crm/contracts';
import { useCallback } from 'react';

export const DEFAULT_TIME_ZONE = 'America/New_York';

export const DATE_FORMATS = {
  date: 'MMM d, yyyy',
  dateTime: 'MMM d, yyyy h:mm a',
  dateTimeZone: 'MMM d, yyyy h:mm a zzz',
} as const;
export type DateFormat = keyof typeof DATE_FORMATS;

function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(session: Pick<SessionInfo, 'user'> | undefined | null): string {
  const userTz = session?.user.timeZoneName;
  if (isValidTimeZone(userTz)) return userTz;
  const tenantTz = session?.user.tenant.timeZoneName;
  if (isValidTimeZone(tenantTz)) return tenantTz;
  return DEFAULT_TIME_ZONE;
}

export function formatDate(iso: string | undefined | null, timeZone: string, fmt: DateFormat = 'date'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return formatInTimeZone(d, timeZone, DATE_FORMATS[fmt]);
}

/** Formats ISO timestamps in the signed-in user's timezone (user → tenant → America/New_York). */
export function useFormatDate(): (iso: string | undefined | null, fmt?: DateFormat) => string {
  const api = useApi();
  // Passive read of the cached session (works on public pages too, where there is none).
  const { data: session } = useQuery<SessionInfo>({
    queryKey: queryKeys.session,
    queryFn: () => api.auth.session(),
    enabled: false,
    staleTime: Infinity,
  });
  const tz = resolveTimeZone(session);
  return useCallback((iso, fmt = 'date') => formatDate(iso, tz, fmt), [tz]);
}
