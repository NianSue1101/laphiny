import { fetch as expoFetch } from 'expo/fetch';

export function getRuntimeFetch(): typeof globalThis.fetch {
  return expoFetch as unknown as typeof globalThis.fetch;
}
