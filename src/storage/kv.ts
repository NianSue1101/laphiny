import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memoryFallback = new Map<string, string>();

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getString(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await setString(key, JSON.stringify(value));
}

export async function getString(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? memoryFallback.get(key) ?? null;
    } catch {
      return memoryFallback.get(key) ?? null;
    }
  }

  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return memoryFallback.get(key) ?? null;
  }
}

export async function setString(key: string, value: string): Promise<void> {
  memoryFallback.set(key, value);

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // memory fallback already updated
    }
    return;
  }

  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // memory fallback already updated
  }
}
