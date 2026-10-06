import { format, isValid, parseISO } from 'date-fns';

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return isValid(d) ? d : null;
}

export function formatDate(value?: string | null, pattern = 'MMM d, yyyy'): string {
  const d = parseDate(value);
  return d ? format(d, pattern) : '—';
}

export function formatDateTime(value?: string | null): string {
  return formatDate(value, 'MMM d, yyyy h:mm a');
}

export function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

export function initials(first?: string | null, last?: string | null, fallback = '?'): string {
  const s = `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  return s || fallback;
}

export function cityState(city?: string | null, state?: string | null): string {
  return [city, state].filter(Boolean).join(', ');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
