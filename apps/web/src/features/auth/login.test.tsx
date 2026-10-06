import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { db, resetDb, server } from '@/test/setup';
import { renderApp } from '@/test/utils';

async function signIn(user: ReturnType<typeof renderApp>['user'], email: string, password = 'Password1!') {
  await user.type(await screen.findByLabelText('Email address'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in to CRM' }));
}

describe('login flow', () => {
  it('redirects an unauthenticated deep link to /login?redirect= and back after sign-in', async () => {
    resetDb({ signedIn: false });
    const { user, location } = renderApp('/accounts?status=all');
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(location().pathname).toBe('/login');
    expect(location().search.redirect).toBe('/accounts?status=all');

    // No prefilled credentials.
    expect(screen.getByLabelText('Email address')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveValue('');

    await signIn(user, 'chuck@force5.example');
    expect(await screen.findByRole('heading', { name: 'Accounts', level: 1 })).toBeInTheDocument();
    expect(location().pathname).toBe('/accounts');
    expect(location().search.status).toBe('all');
  });

  it('shows a clear error for invalid credentials and clears the password', async () => {
    resetDb({ signedIn: false });
    const { user } = renderApp('/login');
    await signIn(user, 'chuck@force5.example', 'nope');
    expect(await screen.findByRole('alert')).toHaveTextContent('The email or password is incorrect.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(db.signedIn).toBe(false);
  });

  it('shows "Service unavailable" when sign-in is down', async () => {
    resetDb({ signedIn: false });
    const { user } = renderApp('/login');
    await signIn(user, 'down@force5.example');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Service unavailable/);
  });

  it('validates the form before calling the API', async () => {
    resetDb({ signedIn: false });
    let called = false;
    server.use(
      http.post('*/crm/api/auth/login', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in to CRM' }));
    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('lets a multi-tenant user pick an account without retyping the password', async () => {
    resetDb({ signedIn: false });
    const { user, location } = renderApp('/login');
    await signIn(user, 'multi@force5.example');
    expect(await screen.findByRole('heading', { name: 'Choose an account' })).toBeInTheDocument();
    expect(location().pathname).toBe('/login/select-account');
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continue as Force 5 Labs' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeInTheDocument();
    expect(location().pathname).toBe('/');
  });

  it('requires a 6-digit MFA code before entering the app', async () => {
    resetDb({ signedIn: false });
    const { user, location } = renderApp('/login?redirect=%2Fproducts');
    await signIn(user, 'mfa@force5.example');
    expect(await screen.findByRole('heading', { name: 'Verify it’s you' })).toBeInTheDocument();
    expect(screen.getByText(/We sent a 6-digit code to •••• 0199/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Resend code in \d+s/ })).toBeDisabled();

    await user.type(screen.getByLabelText('Digit 1 of 6'), '999999');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is incorrect or has expired.');

    await user.type(screen.getByLabelText('Digit 1 of 6'), '123456');
    expect(await screen.findByRole('heading', { name: 'Products', level: 1 })).toBeInTheDocument();
    expect(location().pathname).toBe('/products');
  });

  it('ignores off-site redirect targets', async () => {
    resetDb({ signedIn: false });
    const { user, location } = renderApp('/login?redirect=%2F%2Fevil.example%2Fphish');
    await signIn(user, 'chuck@force5.example');
    await waitFor(() => expect(location().pathname).toBe('/'));
  });

  it('explains a timeout sign-out', async () => {
    resetDb({ signedIn: false });
    renderApp('/login?reason=timeout');
    expect(await screen.findByText(/signed out after a period of inactivity/)).toBeInTheDocument();
  });
});
