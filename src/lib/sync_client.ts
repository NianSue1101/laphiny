import { AgentReplyBinding, CreatedAgentReplyBinding, ProactiveAgentMessagePage, SquareEvent, SyncConfig, SyncSnapshot } from '../types';
import { getRuntimeFetch } from './runtime_fetch';

export class LaphinySyncClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: Pick<SyncConfig, 'baseUrl' | 'apiKey'>, fetchImpl?: typeof globalThis.fetch) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = config.apiKey.trim();
    this.fetchImpl = fetchImpl ?? getRuntimeFetch();
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

  async listAgentMessages(options?: { after?: number; limit?: number; timeoutMs?: number; signal?: AbortSignal }): Promise<ProactiveAgentMessagePage> {
    const query = new URLSearchParams();
    if (options?.after != null) query.set('after', String(options.after));
    if (options?.limit != null) query.set('limit', String(options.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return this.request(`/v1/agent/messages${suffix}`, {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async acknowledgeAgentMessages(deviceId: string, lastSequence: number, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ deviceId: string; lastSequence: number; updatedAt?: string }> {
    return this.request('/v1/agent/acks', {
      method: 'POST',
      body: JSON.stringify({ deviceId, lastSequence }),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async *streamAgentMessages(options?: { after?: number; connectTimeoutMs?: number; signal?: AbortSignal }): AsyncGenerator<import('../types').ProactiveAgentMessageEvent, void, undefined> {
    if (!this.baseUrl) throw new Error('Sync backend URL is empty');
    const query = options?.after != null ? `?after=${encodeURIComponent(String(options.after))}` : '';
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options?.signal?.aborted) controller.abort();
    else options?.signal?.addEventListener('abort', onAbort, { once: true });
    const timeoutId = options?.connectTimeoutMs
      ? setTimeout(() => controller.abort(), options.connectTimeoutMs)
      : null;

    let response: Response;
    try {
      const headers: Record<string, string> = { accept: 'text/event-stream' };
      if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
      response = await this.fetchImpl(`${this.baseUrl}/v1/agent/stream${query}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!response.ok) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw new Error(`HTTP ${response.status}: ${await response.text() || response.statusText}`);
    }
    if (!response.body?.getReader) {
      options?.signal?.removeEventListener('abort', onAbort);
      throw new Error('Sync backend did not return a readable Agent event stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let ended = false;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          ended = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/gu, '\n');
        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';
        for (const frame of frames) {
          const event = parseProactiveMessageSseFrame(frame);
          if (event) yield event;
        }
      }
    } finally {
      if (!ended && !controller.signal.aborted) {
        try { await reader.cancel(); } catch { /* stream already closed */ }
      }
      options?.signal?.removeEventListener('abort', onAbort);
    }
  }

  async listAgentBindings(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<{ bindings: AgentReplyBinding[] }> {
    return this.request('/v1/agent-bindings', {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async createAgentBinding(input: { roomId: string; connectionId: string; authorName?: string; expiresAt?: string }, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<CreatedAgentReplyBinding> {
    return this.request('/v1/agent-bindings', {
      method: 'POST',
      body: JSON.stringify(input),
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async revokeAgentBinding(bindingId: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<AgentReplyBinding> {
    return this.request(`/v1/agent-bindings/${encodeURIComponent(bindingId)}`, {
      method: 'DELETE',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE';
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
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
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

function parseProactiveMessageSseFrame(frame: string): import('../types').ProactiveAgentMessageEvent | null {
  let eventName = '';
  const dataLines: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) eventName = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  if (eventName !== 'proactive-message' || dataLines.length === 0) return null;
  try {
    const value = JSON.parse(dataLines.join('\n')) as import('../types').ProactiveAgentMessageEvent;
    return value?.protocol === 'laphiny.proactive-message.v1' ? value : null;
  } catch {
    return null;
  }
}
