import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { db, server } from '@/test/setup';
import { renderApp } from '@/test/utils';

type Captured = { mode?: string; account?: Record<string, unknown> };

function captureCreate(): Captured {
  const captured: Captured = {};
  server.events.on('request:start', async ({ request }) => {
    if (request.method === 'POST' && new URL(request.url).pathname === '/crm/api/accounts') {
      const body = (await request.clone().json()) as { mode: string; account: Record<string, unknown> };
      captured.mode = body.mode;
      captured.account = body.account;
    }
  });
  return captured;
}

async function fillRequired(user: ReturnType<typeof renderApp>['user']) {
  await user.selectOptions(screen.getByLabelText(/^Language/), 'English');
  await user.click(screen.getByRole('button', { name: /^Time zone/ }));
  await user.type(await screen.findByRole('combobox', { name: 'Search time zones' }), 'chicago');
  await user.keyboard('{Enter}');
  await user.type(screen.getByLabelText(/^First name/), 'Megan');
  await user.type(screen.getByLabelText(/^Last name/), 'Harris');
  await user.type(screen.getByLabelText(/^Email/), 'megan@blueridge.example');
  await user.type(screen.getByLabelText(/^Mobile/), '+1 404 555 0123');
  await user.selectOptions(screen.getByLabelText(/^Country/), 'United States');
  await user.type(screen.getByLabelText(/^Address/), '1 Peachtree St');
  await user.type(screen.getByLabelText(/^City/), 'Atlanta');
  await user.selectOptions(screen.getByLabelText(/^State/), 'Georgia');
  await user.type(screen.getByLabelText(/^ZIP code/), '30303');
}

describe('account form — draft vs publish', () => {
  it('saves a draft with only the company name and moves to the new account URL', async () => {
    const captured = captureCreate();
    const { user, location } = renderApp('/accounts/new');
    expect(await screen.findByRole('heading', { name: 'New Account', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Drafts are flexible.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Licenses' })).toBeDisabled();

    await user.type(screen.getByLabelText(/^Company name/), 'Blue Ridge Water');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));

    expect(await screen.findByText('Draft created')).toBeInTheDocument();
    await waitFor(() => expect(location().pathname).toMatch(/^\/accounts\/\d+$/));
    expect(captured.mode).toBe('draft');
    expect(captured.account).toMatchObject({ name: 'Blue Ridge Water' });
    expect(await screen.findByRole('heading', { name: 'Blue Ridge Water', level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Draft', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeInTheDocument();
  });

  it('requires the company name even for a draft', async () => {
    const { user } = renderApp('/accounts/new');
    await user.click(await screen.findByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText('Company name is required')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Company name/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('checks the format of filled-in fields on a draft save, without requiring them', async () => {
    const captured = captureCreate();
    const { user } = renderApp('/accounts/new');
    await user.type(await screen.findByLabelText(/^Company name/), 'Acme');
    await user.type(screen.getByLabelText(/^Email/), 'not-an-email');
    await user.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.queryByText('Language is required')).not.toBeInTheDocument();
    expect(captured.mode).toBeUndefined();
  });

  it('runs full validation on Publish and does not open the dialog when fields are missing', async () => {
    const captured = captureCreate();
    const { user } = renderApp('/accounts/new');
    await user.type(await screen.findByLabelText(/^Company name/), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    for (const msg of ['Language is required', 'Time zone is required', 'First name is required', 'Email is required', 'Mobile is required', 'Country is required', 'Postal code is required']) {
      expect(await screen.findByText(msg)).toBeInTheDocument();
    }
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(captured.mode).toBeUndefined();
  });

  it('applies country rules: US needs a state and a valid ZIP; Canada uses a province field', async () => {
    const { user } = renderApp('/accounts/new');
    await user.type(await screen.findByLabelText(/^Company name/), 'Acme');
    await user.selectOptions(screen.getByLabelText(/^Country/), 'United States');
    await user.type(screen.getByLabelText(/^ZIP code/), 'ABCDE');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('State is required')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid zip code (5-digit ZIP or ZIP+4)')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^Country/), 'Canada');
    expect(screen.queryByLabelText(/^State/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Province/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Postal code/)).toBeInTheDocument();
  });

  it('publishes a complete new account after confirming who gets the welcome email', async () => {
    const captured = captureCreate();
    const { user, location } = renderApp('/accounts/new');
    await user.type(await screen.findByLabelText(/^Company name/), 'Blue Ridge Power');
    await fillRequired(user);
    await user.click(screen.getByRole('button', { name: 'Publish' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Publish Blue Ridge Power?');
    expect(dialog).toHaveTextContent('The welcome email with login credentials will be sent to megan@blueridge.example.');
    expect(captured.mode).toBeUndefined();
    await user.click(within(dialog).getByRole('button', { name: 'Publish account' }));

    expect(await screen.findByText(/Blue Ridge Power published/)).toBeInTheDocument();
    expect(captured.mode).toBe('publish');
    expect(captured.account).toMatchObject({ timeZoneName: 'America/Chicago', languageId: 1, countryId: 1, stateId: 10, postalCode: '30303' });
    await waitFor(() => expect(location().pathname).toMatch(/^\/accounts\/\d+$/));
    expect(await screen.findByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(screen.getByText(/^Registered .* by Chuck Cavaness$/)).toBeInTheDocument();
  });

  it('explains when VMS cannot publish an existing draft and keeps the edits as a draft', async () => {
    const { user } = renderApp('/accounts/103');
    expect(await screen.findByRole('heading', { name: 'Blue Ridge Power', level: 1 })).toBeInTheDocument();
    // The fixture draft has everything except a mobile number.
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Mobile is required')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^Mobile/), '+1 404 555 0123');
    await user.click(screen.getByRole('button', { name: /^Time zone/ }));
    await user.type(await screen.findByRole('combobox', { name: 'Search time zones' }), 'chicago');
    await user.keyboard('{Enter}');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Publish account' }));
    expect(await screen.findByText(/Publishing an existing draft isn’t available yet/)).toBeInTheDocument();
    await waitFor(() => expect(db.accounts.find((a) => a.id === 103)?.timeZoneName).toBe('America/Chicago'));
    expect(db.accounts.find((a) => a.id === 103)?.registeredDate).toBeUndefined();
  });

  it('shows BFF field errors inline instead of a false success', async () => {
    server.use(
      http.put('*/crm/api/accounts/:id', () =>
        HttpResponse.json(
          { error: { code: 'VALIDATION', message: 'Invalid', fieldErrors: { mainContactEmail: 'That email is already an administrator elsewhere' } } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderApp('/accounts/101');
    await user.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('That email is already an administrator elsewhere')).toBeInTheDocument();
    expect(screen.queryByText('Changes saved')).not.toBeInTheDocument();
  });

  it('keeps the tab in the URL and locks the label preset after publish', async () => {
    const { user, location } = renderApp('/accounts/101');
    expect(await screen.findByLabelText('Label preset')).toBeDisabled();
    expect(screen.getByLabelText('Require 2-factor authentication')).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('tab', { name: 'Licenses' }));
    await waitFor(() => expect(location().search.tab).toBe('licenses'));
    expect(await screen.findByText('ExpectSafe Admin')).toBeInTheDocument();
  });
});
