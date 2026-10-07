import { Platform } from 'react-native';

/**
 * BFF base URL (including `/crm/api`). Set `EXPO_PUBLIC_API_URL` to override.
 *
 * - Android emulator: the host machine is reachable at 10.0.2.2.
 * - iOS simulator / web: localhost.
 * - Physical device: use your computer's LAN IP, e.g. http://192.168.1.50:8082/crm/api
 *   (phone and computer on the same Wi-Fi; the BFF must listen on 0.0.0.0).
 */
const DEFAULT_API_URL =
  Platform.OS === 'android' ? 'http://10.0.2.2:8082/crm/api' : 'http://localhost:8082/crm/api';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL?.trim() || DEFAULT_API_URL).replace(/\/+$/, '');

/** Fallback when the session doesn't tell us (plan §4.3 default). */
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 60;
