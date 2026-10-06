import type { StatusFilter } from '@crm/contracts';

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'all', label: 'All' },
] as const satisfies ReadonlyArray<{ value: StatusFilter; label: string }>;
