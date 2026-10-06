import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/setup';
import { renderApp } from '@/test/utils';

const table = () => screen.getByRole('table', { name: 'Accounts' });
const rowNames = () =>
  within(table())
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getAllByRole('cell')[0]?.textContent);

describe('accounts list', () => {
  it('loads active accounts by default, with clean URL defaults', async () => {
    const { location } = renderApp('/accounts');
    expect(await screen.findByRole('link', { name: 'Northstar Construction' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Coastal Infrastructure' })).not.toBeInTheDocument(); // inactive
    expect(screen.getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true');
    expect(location().href).toBe('/accounts');
    // Phone "Missing" in red for accounts without an office phone (Blue Ridge is a draft → active flag true).
    expect(within(table()).getAllByText('Missing').length).toBeGreaterThan(0);
  });

  it('syncs the status filter, sort and page size to the URL', async () => {
    const { user, location } = renderApp('/accounts');
    await screen.findByRole('link', { name: 'Northstar Construction' });

    await user.click(screen.getByRole('radio', { name: 'Inactive' }));
    await waitFor(() => expect(location().search.status).toBe('inactive'));
    expect(await screen.findByRole('link', { name: 'Coastal Infrastructure' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Northstar Construction' })).not.toBeInTheDocument());

    await user.click(screen.getByRole('radio', { name: 'All' }));
    await waitFor(() => expect(location().search.status).toBe('all'));

    await user.click(screen.getByRole('button', { name: /^Created/ }));
    await waitFor(() => expect(location().search).toMatchObject({ sort: 'dateCreated', dir: 'asc' }));
    expect(screen.getByRole('columnheader', { name: /Created/ })).toHaveAttribute('aria-sort', 'ascending');
    await user.click(screen.getByRole('button', { name: /^Created/ }));
    await waitFor(() => expect(location().search.dir).toBe('desc'));
    await waitFor(() => expect(rowNames()[0]).toBe('Blue Ridge Power')); // newest first

    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '50');
    await waitFor(() => expect(location().search.size).toBe(50));
  });

  it('debounces search into the URL and offers to clear filters when nothing matches', async () => {
    const { user, location } = renderApp('/accounts');
    await screen.findByRole('link', { name: 'Northstar Construction' });
    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'apex');
    await waitFor(() => expect(location().search.search).toBe('apex'));
    await waitFor(() => expect(rowNames()).toEqual(['Apex Energy Services']));

    await user.clear(screen.getByRole('searchbox', { name: 'Search accounts' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'zzz');
    expect(await screen.findByText('No accounts match “zzz”.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(location().href).toBe('/accounts'));
    expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toHaveValue('');
  });

  it('restores filters from a shared URL', async () => {
    renderApp('/accounts?status=inactive&search=coastal');
    expect(await screen.findByRole('link', { name: 'Coastal Infrastructure' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Inactive' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toHaveValue('coastal');
  });

  it('renders HTML in account names as plain text (stored XSS fix)', async () => {
    renderApp('/accounts');
    const link = await screen.findByRole('link', { name: '<img src=x onerror="alert(1)"> Evil Corp' });
    expect(link.textContent).toBe('<img src=x onerror="alert(1)"> Evil Corp');
    expect(document.querySelector('img[src="x"]')).toBeNull();
  });

  it('deactivates after confirmation with the right wording, optimistically', async () => {
    const { user } = renderApp('/accounts');
    await screen.findByRole('link', { name: 'Northstar Construction' });
    await user.click(screen.getByRole('button', { name: 'More actions for Northstar Construction' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Deactivate account Northstar Construction?');
    expect(within(dialog).getByText('Northstar Construction').tagName).toBe('B');
    await user.click(within(dialog).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('Northstar Construction deactivated')).toBeInTheDocument();
  });

  it('rolls the badge back and shows an error when deactivation fails', async () => {
    server.use(
      http.patch('*/crm/api/accounts/:id', () =>
        HttpResponse.json({ error: { code: 'INTERNAL', message: 'VMS rejected the change' } }, { status: 500 }),
      ),
    );
    const { user } = renderApp('/accounts');
    await screen.findByRole('link', { name: 'Northstar Construction' });
    await user.click(screen.getByRole('button', { name: 'More actions for Northstar Construction' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Deactivate' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Deactivate' }));
    expect(await screen.findByText('VMS rejected the change')).toBeInTheDocument();
    const row = screen.getByRole('link', { name: 'Northstar Construction' }).closest('tr')!;
    await waitFor(() => expect(within(row).getByText('Active')).toBeInTheDocument());
  });
});
