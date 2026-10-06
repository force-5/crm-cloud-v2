import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { db } from '@/test/setup';
import { renderApp } from '@/test/utils';

describe('products', () => {
  it('lists products with an N/A badge for empty descriptions', async () => {
    renderApp('/products');
    const row = (await screen.findByRole('link', { name: 'Kiosk' })).closest('tr')!;
    expect(within(row).getByText('N/A')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Legacy API' })).not.toBeInTheDocument();
  });

  it('shows VMS field errors inline and never a false success', async () => {
    const { user } = renderApp('/products/1');
    const code = await screen.findByLabelText(/^Product code/);
    expect(screen.getByText(/Created by Chuck Cavaness on Jan 12, 2026 · Updated by Chuck Cavaness on Sep 29, 2026/)).toBeInTheDocument();
    await user.clear(code);
    await user.type(code, 'DUPLICATE');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('This product code is already in use')).toBeInTheDocument();
    expect(screen.queryByText('Changes saved')).not.toBeInTheDocument();
  });

  it('saves and stays on the page', async () => {
    const { user, location } = renderApp('/products/2');
    const name = await screen.findByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, 'Front Desk Pro');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Changes saved')).toBeInTheDocument();
    expect(location().pathname).toBe('/products/2');
    expect(db.products.find((p) => p.id === 2)?.name).toBe('Front Desk Pro');
  });

  it('deletes after a destructive confirmation', async () => {
    const { user, location } = renderApp('/products/3');
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Delete product Kiosk? This cannot be undone.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete product' }));
    await waitFor(() => expect(location().pathname).toBe('/products'));
    expect(db.products.some((p) => p.id === 3)).toBe(false);
  });

  it('hides Delete for an unsaved product', async () => {
    renderApp('/products/new');
    expect(await screen.findByRole('button', { name: 'Create product' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
});
