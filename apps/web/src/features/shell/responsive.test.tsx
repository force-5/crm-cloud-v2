import { afterEach, describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { setViewportWidth } from '@/test/setup';
import { renderApp } from '@/test/utils';

describe('phone layout (375px)', () => {
  afterEach(() => setViewportWidth(1280));

  it('renders accounts as stacked cards and the nav as a drawer', async () => {
    setViewportWidth(375);
    const { user } = renderApp('/accounts');
    const list = await screen.findByRole('list', { name: 'Accounts' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const card = (await within(list).findByRole('link', { name: 'Northstar Construction' })).closest('li')!;
    expect(within(card).getByText('Active')).toBeInTheDocument();
    expect(within(card).getByText('sarah.mitchell@northstar.example')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'More actions for Northstar Construction' })).toBeInTheDocument();

    // No sidebar until the hamburger opens the drawer.
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const drawer = await screen.findByRole('dialog', { name: 'Main navigation' });
    await user.click(within(drawer).getByRole('link', { name: 'Products' }));
    expect(await screen.findByRole('heading', { name: 'Products', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Main navigation' })).not.toBeInTheDocument();
  });

  it('uses an icon rail with accessible labels on tablets', async () => {
    setViewportWidth(900);
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Accounts' })).toBeInTheDocument();
    expect(within(nav).queryByText('Accounts')).not.toBeInTheDocument(); // icon only
  });
});
