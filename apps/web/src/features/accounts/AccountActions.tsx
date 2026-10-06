import * as React from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Power, PowerOff } from 'lucide-react';
import { PERMISSIONS, type AccountSummary } from '@crm/contracts';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/menu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useCan } from '@/lib/permissions';
import { richT } from '@/lib/richText';
import { useSetAccountActive } from './api';

/** Row "⋯" menu: Edit, plus Activate / Deactivate (confirmed, optimistic). */
export function AccountRowMenu({ account }: { account: Pick<AccountSummary, 'id' | 'name' | 'status'> }) {
  const { t } = useTranslation('accounts');
  const navigate = useNavigate();
  const canUpdate = useCan(PERMISSIONS.ACCOUNTS, 'update');
  const setActive = useSetAccountActive();
  const [confirm, setConfirm] = React.useState(false);
  const isActive = account.status === 'active';
  const toggleable = account.status !== 'draft' && canUpdate;
  const nextActive = !isActive;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('common:actions.moreActions', { name: account.name })}>
            <MoreHorizontal className="!size-5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => void navigate({ to: '/accounts/$accountId', params: { accountId: account.id } })}>
            <Pencil aria-hidden="true" />
            {t('common:actions.edit')}
          </DropdownMenuItem>
          {toggleable && (
            <DropdownMenuItem destructive={isActive} onSelect={() => setConfirm(true)}>
              {isActive ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
              {isActive ? t('common:actions.deactivate') : t('common:actions.activate')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={richT(t, nextActive ? 'confirm.activateTitle' : 'confirm.deactivateTitle', { name: <b>{account.name}</b> })}
        description={nextActive ? t('confirm.activateBody') : t('confirm.deactivateBody')}
        confirmLabel={nextActive ? t('common:actions.activate') : t('common:actions.deactivate')}
        destructive={!nextActive}
        onConfirm={() => {
          // Optimistic: close immediately; the badge flips now and rolls back on error.
          setActive.mutate({ account, active: nextActive });
        }}
      />
    </>
  );
}
