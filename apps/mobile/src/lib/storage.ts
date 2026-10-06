import * as SecureStore from 'expo-secure-store';

/** Tiny key/value persistence for UI preferences (SecureStore is the only store installed). */
export async function getPref(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setPref(key: string, value: string | null): Promise<void> {
  try {
    if (value === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Preferences are best-effort.
  }
}
