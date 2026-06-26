import {
  HermesChatCompletionRequest,
  HermesChatCompletionResponse,
  HermesConnection,
  HermesHealthResponse,
  HermesModel,
  HermesModelsResponse,
} from '../types';

export class HermesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(connection: Pick<HermesConnection, 'baseUrl' | 'apiKey'>) {
    this.baseUrl = connection.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = connection.apiKey.trim();
  }

  async health(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<HermesHealthResponse> {
    for (const path of ['/health', '/v1/health']) {
      try {
        return await this.request(path, { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
      } catch {
        // ignore and try the next path
      }
    }
    throw new Error('Unable to reach Hermes health endpoint');
  }

  async models(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<HermesModel[]> {
    const response = await this.request<HermesModelsResponse>('/v1/models', {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
    return response.data ?? [];
  }

  async chatCompletion(
    request: HermesChatCompletionRequest,
    options?: { sessionId?: string; sessionKey?: string; timeoutMs?: number; signal?: AbortSignal },
  ): Promise<HermesChatCompletionResponse> {
    return this.request('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
      contentType: 'application/json',
      sessionId: options?.sessionId,
      sessionKey: options?.sessionKey,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });
  }

  async *chatCompletionStream(
    request: HermesChatCompletionRequest,
    options?: { sessionId?: string; sessionKey?: string; timeoutMs?: number; signal?: AbortSignal },
  ): AsyncGenerator<string, void, undefined> {
    const response = await this.fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
      contentType: 'application/json',
      sessionId: options?.sessionId,
      sessionKey: options?.sessionKey,
      timeoutMs: options?.timeoutMs,
      signal: options?.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    const abortReader = () => {
      void reader.cancel().catch(() => undefined);
    };
    options?.signal?.addEventListener('abort', abortReader, { once: true });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('event:')) continue;
          if (trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') return;
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const chunk: HermesSseChunk = JSON.parse(trimmed.slice('data: '.length));
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
              yield content;
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }

      if (options?.signal?.aborted) {
        throw new Error('aborted');
      }
    } finally {
      options?.signal?.removeEventListener('abort', abortReader);
      try {
        await reader.cancel();
      } catch {
        // The reader may already be closed or canceled.
      }
    }
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      contentType?: string;
      sessionId?: string;
      sessionKey?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const response = await this.fetch(path, options);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  private async fetch(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      contentType?: string;
      sessionId?: string;
      sessionKey?: string;
      timeoutMs?: number;
      signal?: AbortSignal;
    },
  ): Promise<Response> {
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
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    if (options.contentType) {
      headers['content-type'] = options.contentType;
    }
    if (options.sessionId) {
      headers['x-hermes-session-id'] = options.sessionId;
    }
    if (options.sessionKey) {
      headers['x-hermes-session-key'] = options.sessionKey;
    }

    try {
      return await globalThis.fetch(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      releaseAbort?.();
    }
  }
}

interface HermesSseChunk {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
}
