import { SquareEvent, SyncConfig, SyncSnapshot } from '../types';

export class LaphinySyncClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: Pick<SyncConfig, 'baseUrl' | 'apiKey'>) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
  }

  async health(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ status: string; updatedAt?: string }> {
    return this.request('/v1/health', { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async pullSnapshot(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SyncSnapshot> {
    return this.request('/v1/snapshot', { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async pushSnapshot(snapshot: SyncSnapshot, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SyncSnapshot> {
    return this.request('/v1/snapshot', {
      method: 'PUT',
      body: JSON.stringify(snapshot),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async listEvents(options?: { since?: string; timeoutMs?: number; signal?: AbortSignal }): Promise<SquareEvent[]> {
    const query = options?.since ? `?since=${encodeURIComponent(options.since)}` : '';
    return this.request(`/v1/events${query}`, { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async appendEvent(event: SquareEvent, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<SquareEvent> {
    return this.request('/v1/events', {
      method: 'POST',
      body: JSON.stringify(event),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT';
      body?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new Error('Sync backend URL is empty');
    }

    const controller = new AbortController();
    const timeoutId = options.timeoutMs ? setTimeout(() => controller.abort(), options.timeoutMs) : null;
    const releaseAbort = options.signal
      ? (() => {
          const onAbort = () => controller.abort();
          options.signal!.addEventListener('abort', onAbort, { once: true });
          return () => options.signal!.removeEventListener('abort', onAbort);
        })()
      : null;

    const headers: Record<string, string> = {};
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    if (options.body) headers['content-type'] = 'application/json';

    try {
      const response = await globalThis.fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      releaseAbort?.();
    }
  }
}
