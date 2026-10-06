import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryHistory } from '@tanstack/react-router';
import { AppProviders, createAppInstance } from '@/lib/app';

export const TEST_API = 'http://localhost:3000/crm/api';

/** Renders the whole app (router, query, providers) at `path` against the MSW mock BFF. */
export function renderApp(path: string) {
  const history = createMemoryHistory({ initialEntries: [`/crm${path}`] });
  const app = createAppInstance({ baseUrl: TEST_API, history });
  const user = userEvent.setup();
  const utils = render(<AppProviders app={app} />);
  /** Current location relative to the /crm base path, including the query string. */
  const location = () => {
    const loc = app.router.state.location;
    return { pathname: loc.pathname, search: loc.search as Record<string, unknown>, href: loc.href };
  };
  return { ...utils, user, app, history, location };
}
