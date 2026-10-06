import { createContext, useContext } from 'react';
import { createApi, type CrmApi } from '@crm/api-client';

export const API_BASE_URL = '/crm/api';

export const ApiContext = createContext<CrmApi | null>(null);

export function useApi(): CrmApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('useApi must be used inside <ApiContext.Provider>');
  return api;
}

export function createAppApi(onUnauthorized: () => void, baseUrl = API_BASE_URL): CrmApi {
  return createApi({ baseUrl, onUnauthorized });
}
