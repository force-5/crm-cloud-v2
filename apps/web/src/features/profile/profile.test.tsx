import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { makeUser } from '@/mocks/db';
import { db, resetDb } from '@/test/setup';
import { renderApp } from '@/test/utils';

describe('my profile', () => {
  it('loads fields from the API with the state preselected, and saves', async () => {
    const { user } = renderApp('/profile');
    const first = await screen.findByLabelText(/^First name/);
    expect(first).toHaveValue('Chuck');
    expect(screen.getByLabelText(/^State/)).toHaveDisplayValue('Georgia');
    expect(screen.getByLabelText('Email')).toHaveAttribute('readonly');
    expect(screen.getByText('Security roles').nextElementSibling).toHaveTextContent('Force 5 Admin');

    await user.clear(first);
    await user.type(first, 'Charles');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText('Profile saved')).toBeInTheDocument();
    expect(db.user.firstName).toBe('Charles');
    // Header (session copy) updates without a reload.
    expect(screen.getByRole('button', { name: 'Account menu for Charles Cavaness' })).toBeInTheDocument();
  });

  it('locks MFA on when the organization requires it', async () => {
    resetDb({ user: makeUser({ tenant: { id: 1, name: 'Force 5', requireMfa: true } }) });
    renderApp('/profile?tab=security');
    const toggle = await screen.findByRole('switch', { name: /Enable 2-factor authentication/ });
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Required by your organization')).toBeInTheDocument();
  });

  it('enrols an authenticator app with a client-rendered QR code and manual key', async () => {
    resetDb({ user: makeUser({ mfaEnabled: true, mfaType: 'sms' }) });
    const { user } = renderApp('/profile?tab=security');
    await user.click(await screen.findByRole('radio', { name: 'Authenticator app (TOTP)' }));
    expect(await screen.findByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /I’ve added it/ }));
    await waitFor(() => expect(db.user.mfaType).toBe('totp'));
  });

  it('links to Forgot password instead of a change-password form', async () => {
    renderApp('/profile?tab=security');
    expect(await screen.findByRole('link', { name: 'Forgot password' })).toHaveAttribute('href', '/crm/forgot-password');
    expect(screen.queryByLabelText(/Current password/)).not.toBeInTheDocument();
  });

  it('applies the theme instantly from the Appearance tab', async () => {
    const { user } = renderApp('/profile?tab=appearance');
    await user.click(await screen.findByRole('radio', { name: 'Dark' }));
    expect(document.documentElement).toHaveClass('dark');
    await waitFor(() => expect(db.user.themeName).toBe('dark'));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    expect(document.documentElement).not.toHaveClass('dark');
  });
});
