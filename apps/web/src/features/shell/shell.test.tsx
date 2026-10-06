import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { makeUser } from '@/mocks/db';
import { db, resetDb, server } from '@/test/setup';
import { renderApp } from '@/test/utils';
import { formatCountdown } from './IdleTimer';
import { safeRedirect } from '@/lib/utils';

describe('app shell', () => {
  it('renders the dashboard KPIs, env badge, breadcrumb and footer', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('development')).toBeInTheDocument();
    const kpis = screen.getByText('Total accounts').closest('dl')!;
    expect(within(kpis).getByText('Total accounts')).toBeInTheDocument();
    await waitFor(() => expect(within(kpis).getByText('7')).toBeInTheDocument());
    expect(within(kpis).queryByText('Draft')).not.toBeInTheDocument(); // draft === null
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveTextContent('CRM');
    expect(screen.getAllByText(`© ${new Date().getFullYear()} Force 5, Inc.`).length).toBeGreaterThan(0);
  });

  it('hides the environment badge in production', async () => {
    resetDb({ environment: 'production' });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 });
    expect(screen.queryByText('production')).not.toBeInTheDocument();
  });

  it('gates navigation and pages by permission', async () => {
    resetDb({ user: makeUser({ permissions: [{ code: 'MANAGE_ACCOUNT', read: true, create: false, update: false, delete: false, execute: false }] }) });
    renderApp('/products');
    expect(await screen.findByRole('heading', { name: 'No access' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Accounts' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Products' })).not.toBeInTheDocument();
  });

  it('sends the user to login with ?redirect on any 401', async () => {
    const { location } = renderApp('/accounts');
    await screen.findByRole('link', { name: 'Northstar Construction' });
    db.signedIn = false;
    server.use(http.get('*/crm/api/accounts', () => HttpResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Expired' } }, { status: 401 })));
    screen.getByRole('radio', { name: 'All' }).click();
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(location().search.redirect).toBe('/accounts?status=all');
  });

  it('logs out from the user menu', async () => {
    const { user, location } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Chuck Cavaness' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Logout' }));
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(location().pathname).toBe('/login');
    expect(db.signedIn).toBe(false);
  });

  it('switches theme from the user menu, persisting locally and to the profile', async () => {
    const { user } = renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Account menu for Chuck Cavaness' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(window.localStorage.getItem('crm-theme')).toBe('dark');
    await waitFor(() => expect(db.user.themeName).toBe('dark'));
  });

  it('shows a 404 page for unknown routes', async () => {
    renderApp('/nope/not-here');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});

describe('helpers', () => {
  it('formats the idle countdown', () => {
    expect(formatCountdown(5 * 60_000)).toBe('5:00');
    expect(formatCountdown(61_000)).toBe('1:01');
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('only allows same-origin redirect paths', () => {
    expect(safeRedirect('/accounts?status=all')).toBe('/accounts?status=all');
    expect(safeRedirect('//evil.example')).toBe('/');
    expect(safeRedirect('https://evil.example/x')).toBe('/');
    expect(safeRedirect('/\\evil.example')).toBe('/');
    expect(safeRedirect('/login')).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
