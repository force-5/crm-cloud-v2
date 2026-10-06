import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ThemeName } from '@crm/contracts';
import { useApi } from '@/lib/api';
import { useUpdateSessionUser } from '@/lib/session';
import { useTheme } from '@/lib/theme';

/** Applies the theme instantly (and to localStorage), then saves it to the profile. */
export function useChangeTheme(): (theme: ThemeName) => void {
  const api = useApi();
  const { t } = useTranslation('shell');
  const { setTheme } = useTheme();
  const updateUser = useUpdateSessionUser();
  const mutation = useMutation({
    mutationFn: (themeName: ThemeName) => api.profile.preferences({ themeName }),
    onSuccess: (_res, themeName) => updateUser({ themeName }),
    onError: () => toast.error(t('theme.saveFailed')),
  });
  return (theme) => {
    setTheme(theme);
    mutation.mutate(theme);
  };
}
