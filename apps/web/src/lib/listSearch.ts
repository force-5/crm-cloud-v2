/** Default list search params, stripped from URLs so links stay clean (`/accounts` not `/accounts?page=1&size=20&status=active`). */
export const LIST_DEFAULTS = { page: 1, size: 20, status: 'active' } as const;
