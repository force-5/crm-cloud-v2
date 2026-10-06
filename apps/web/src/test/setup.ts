import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import { cleanup, configure } from '@testing-library/react';
import { setupServer } from 'msw/node';
import '@/lib/i18n';
import { createDb, type MockDb } from '@/mocks/db';
import { createHandlers } from '@/mocks/handlers';

// Route chunks load lazily (code splitting), so give async queries a little longer.
configure({ asyncUtilTimeout: 5000 });

// ---- browser APIs jsdom lacks ---------------------------------------------------------------------

/** Evaluates simple (min|max)-width media queries against a fixed desktop viewport. */
function matches(query: string, width: number): boolean {
  if (query.includes('prefers-color-scheme: dark')) return false;
  return query.split(/\s+and\s+/).every((part) => {
    const min = /min-width:\s*([\d.]+)px/.exec(part);
    const max = /max-width:\s*([\d.]+)px/.exec(part);
    if (min) return width >= Number(min[1]);
    if (max) return width <= Number(max[1]);
    return true;
  });
}

export function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeAll(() => {
  setViewportWidth(1280);
  window.matchMedia = (query: string) =>
    ({
      matches: matches(query, window.innerWidth),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => undefined;
});

// ---- MSW: fresh fixture DB per test -----------------------------------------------------------------

export const server = setupServer();
export let db: MockDb;

export function resetDb(overrides: Partial<MockDb> = {}): MockDb {
  db = createDb(overrides);
  server.resetHandlers(...createHandlers(db));
  return db;
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(() => {
  resetDb();
  try {
    window.localStorage.clear();
  } catch {
    /* ignore */
  }
});
afterEach(() => cleanup());
afterAll(() => server.close());
