import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';

const memoryFallback = new Map<string, string>();
const durableMemoryFallback = new Map<string, string>();
const DURABLE_DIR = `${FileSystem.documentDirectory ?? ''}laphiny-storage/`;

export async function getJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getString(key);
  return parseJson(raw, fallback);
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await setString(key, JSON.stringify(value));
}

export async function getDurableJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await getDurableString(key);
  return parseJson(raw, fallback);
}

export async function setDurableJson<T>(key: string, value: T): Promise<void> {
  await setDurableString(key, JSON.stringify(value));
}

/**
 * Small, secret-oriented key/value storage.
 * Native uses SecureStore, so keep this for API keys and sync tokens only.
 */
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

/**
 * Large, non-secret local records such as rooms/messages/logs.
 * Web keeps localStorage for compatibility; native stores JSON files under documentDirectory
 * instead of SecureStore, which is not designed for growing chat histories.
 */
export async function getDurableString(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return getString(key);
  }

  const memoryValue = durableMemoryFallback.get(key);
  try {
    const fileUri = durableFileUri(key);
    const info = await FileSystem.getInfoAsync(fileUri);
    if (info.exists) {
      return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
    }
  } catch {
    // fall through to memory fallback
  }

  return memoryValue ?? null;
}

export async function setDurableString(key: string, value: string): Promise<void> {
  durableMemoryFallback.set(key, value);

  if (Platform.OS === 'web') {
    await setString(key, value);
    return;
  }

  try {
    await ensureDurableDir();
    await FileSystem.writeAsStringAsync(durableFileUri(key), value, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    // durable memory fallback already updated
  }
}

/**
 * One-way migration helper for non-secret records that used to live in SecureStore.
 */
export async function migrateSecureStoreValueToDurable(key: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  const durable = await getDurableString(key);
  if (durable) {
    return false;
  }

  const legacy = await getString(key);
  if (!legacy) {
    return false;
  }

  await setDurableString(key, legacy);
  return true;
}

export async function describeStorageBackend(): Promise<{
  secretBackend: string;
  durableBackend: string;
  durableDirectory?: string;
}> {
  if (Platform.OS === 'web') {
    return { secretBackend: 'localStorage', durableBackend: 'localStorage' };
  }

  return {
    secretBackend: 'expo-secure-store',
    durableBackend: FileSystem.documentDirectory ? 'expo-file-system' : 'memory-fallback',
    durableDirectory: FileSystem.documentDirectory ? DURABLE_DIR : undefined,
  };
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function ensureDurableDir(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    return;
  }

  const info = await FileSystem.getInfoAsync(DURABLE_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DURABLE_DIR, { intermediates: true });
  }
}

function durableFileUri(key: string): string {
  const safeKey = encodeURIComponent(key).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${DURABLE_DIR}${safeKey}.json`;
}
