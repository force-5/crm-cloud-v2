import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { db } from '@/test/setup';
import { renderApp } from '@/test/utils';

describe('licenses tab', () => {
  it('shows seats with over-allocation highlighted', async () => {
    renderApp('/accounts/101?tab=licenses');
    const table = await screen.findByRole('table', { name: 'Licenses for Northstar Construction' });
    await within(table).findByText('Pre-Registration');
    const row = within(table).getByText('Pre-Registration').closest('tr')!;
    expect(within(row).getByText('7 used · -2 available')).toHaveClass('text-danger');
    expect(within(row).getByText('Trial')).toBeInTheDocument();
    expect(within(row).getByRole('progressbar')).toHaveAccessibleName('7 of 5 seats used');
  });

  it('adds a license from the assignable products and refreshes the picker', async () => {
    const { user } = renderApp('/accounts/101?tab=licenses');
    await screen.findByRole('table', { name: /Licenses for/ });
    await user.click(screen.getByRole('button', { name: 'Add license' }));
    const dialog = await screen.findByRole('dialog', { name: 'Add license' });

    await user.click(within(dialog).getByRole('combobox', { name: /^Product/ }));
    const listbox = await screen.findByRole('listbox');
    // Already-assigned products are excluded.
    expect(within(listbox).queryByText(/ExpectSafe Admin/)).not.toBeInTheDocument();
    await user.click(within(listbox).getByText('ExpectSafe Mobile (Perpetual)'));
    expect(within(dialog).getByText('SKU_DEF_8921')).toBeInTheDocument();

    const seats = within(dialog).getByLabelText(/^Purchased seats/);
    await user.clear(seats);
    await user.type(seats, '0');
    await user.click(within(dialog).getByRole('button', { name: 'Add license' }));
    expect(await within(dialog).findByText('At least 1 seat')).toBeInTheDocument();

    await user.clear(seats);
    await user.type(seats, '10');
    await user.click(within(dialog).getByRole('button', { name: 'Add license' }));
    expect(await screen.findByText('ExpectSafe Mobile license added')).toBeInTheDocument();
    expect(await screen.findByText('ExpectSafe Mobile', { selector: 'b' })).toBeInTheDocument();
    expect(db.licenses[101]?.some((l) => l.productName === 'ExpectSafe Mobile' && l.purchasedCount === 10)).toBe(true);
  });

  it('warns (but allows) setting seats below the used count', async () => {
    const { user } = renderApp('/accounts/101?tab=licenses');
    await screen.findByRole('table', { name: /Licenses for/ });
    await user.click(await screen.findByRole('button', { name: 'Actions for ExpectSafe Admin' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Edit seats' }));
    const input = await screen.findByLabelText('Purchased seats');
    await user.clear(input);
    await user.type(input, '10');
    expect(screen.getByText(/below the 14 seats already in use/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save seats' }));
    expect(await screen.findByText('Seats updated for ExpectSafe Admin')).toBeInTheDocument();
    await waitFor(() => expect(db.licenses[101]?.find((l) => l.id === 1001)?.purchasedCount).toBe(10));
  });
});
