import { useCallback, useSyncExternalStore } from 'react';

function getMatch(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false;
}

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => getMatch(query),
    () => false,
  );
}

/** < 768px: phone layout (drawer nav, card lists, bottom sheets). */
export const PHONE_QUERY = '(max-width: 767.98px)';
/** 768–1023px: tablet layout (icon-only sidebar). */
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023.98px)';

export const useIsPhone = () => useMediaQuery(PHONE_QUERY);
