import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? '').trim().charAt(0);
  const b = (last ?? '').trim().charAt(0);
  return (a + b).toUpperCase() || '?';
}

export function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter((s) => s && s.trim()).join(' ');
}

/** Only allow same-origin, app-relative redirect targets (prevents open redirects). */
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string' || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return fallback;
  }
  try {
    const url = new URL(target, 'http://x.invalid');
    if (url.origin !== 'http://x.invalid') return fallback;
    // Never bounce back into the public auth pages.
    if (/^\/(login|forgot-password)(\/|$|\?)/.test(url.pathname)) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
