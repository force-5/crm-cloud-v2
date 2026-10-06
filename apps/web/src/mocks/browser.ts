import { setupWorker } from 'msw/browser';
import { createDb } from './db';
import { createHandlers } from './handlers';

/**
 * Dev-only mock backend (`VITE_MOCK_API=true`). Lets you click through every screen without
 * the BFF. Sign in with any email and password `Password1!` (emails starting with `multi`/`mfa`
 * exercise the account picker / MFA code `123456`).
 */
export async function startMockWorker(): Promise<void> {
  const db = createDb({ signedIn: false });
  const worker = setupWorker(...createHandlers(db));
  await worker.start({
    serviceWorker: { url: '/crm/mockServiceWorker.js', options: { scope: '/crm/' } },
    onUnhandledRequest: 'bypass',
  });
}
