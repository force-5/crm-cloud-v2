import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { StatusFilter } from '@crm/contracts';

const STATUS_VALUES = ['active', 'inactive', 'all'] as const satisfies ReadonlyArray<StatusFilter>;

/** Active / Inactive / All segmented-control options, translated. */
export function useStatusOptions() {
  const { t } = useTranslation();
  return useMemo(() => STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })), [t]);
}
