import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ChevronDown, LogOut, Monitor, Moon, Sun, UserRound } from 'lucide-react';
import { themeNameSchema } from '@crm/contracts';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/menu';
import { UserAvatar } from '@/components/UserAvatar';
import { useCurrentUser } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { fullName } from '@/lib/utils';
import { useChangeTheme } from './useChangeTheme';
import { useSignOut } from './useSignOut';

export function UserMenu() {
  const { t } = useTranslation('shell');
  const user = useCurrentUser();
  const { theme } = useTheme();
  const changeTheme = useChangeTheme();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const name = fullName(user.firstName, user.lastName) || user.email;
  const role = user.securityRoles[0]?.name ?? user.tenant.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t('userMenu.open', { name })}
        className="group flex min-h-11 items-center gap-2.5 rounded-[10px] px-1.5 py-[7px] text-right transition-colors hover:bg-[#f4f6f8] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus-ring data-[state=open]:bg-[#f4f6f8] sm:px-[9px] dark:hover:bg-surface-muted dark:data-[state=open]:bg-surface-muted"
      >
        <span className="hidden min-w-0 sm:block">
          <b className="block max-w-[220px] truncate text-text">{name}</b>
          <span className="block max-w-[220px] truncate text-[12px] text-text-muted">{role}</span>
        </span>
        <UserAvatar user={user} size={35} />
        <ChevronDown className="size-3.5 text-text-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[230px]">
        <div className="mb-[5px] border-b border-border px-2.5 pb-2.5 pt-[9px]">
          <b className="block truncate text-text">{name}</b>
          <span className="block truncate text-[12px] text-text-muted">{user.email}</span>
        </div>
        <DropdownMenuItem onSelect={() => void navigate({ to: '/profile' })}>
          <UserRound aria-hidden="true" />
          {t('userMenu.profile')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('userMenu.theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => {
            const parsed = themeNameSchema.safeParse(v);
            if (parsed.success) changeTheme(parsed.data);
          }}
        >
          <DropdownMenuRadioItem value="light" onSelect={(e) => e.preventDefault()}>
            <Sun aria-hidden="true" />
            {t('theme.light')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" onSelect={(e) => e.preventDefault()}>
            <Moon aria-hidden="true" />
            {t('theme.dark')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" onSelect={(e) => e.preventDefault()}>
            <Monitor aria-hidden="true" />
            {t('theme.system')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          {t('userMenu.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
