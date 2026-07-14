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
    for await (const event of this.chatCompletionStreamEvents(request, options)) {
      if (event.content) yield event.content;
    }
  }

  async *chatCompletionStreamEvents(
    request: HermesChatCompletionRequest,
    options?: { sessionId?: string; sessionKey?: string; timeoutMs?: number; signal?: AbortSignal },
  ): AsyncGenerator<HermesStreamEvent, void, undefined> {
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

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body?.getReader) {
      const text = await response.text();
      const completion = parseChatCompletionText(text, contentType);
      if (completion) yield { content: completion };
      return;
    }

    const reader = response.body.getReader();
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
          const parsed = parseStreamLine(line);
          if (parsed === 'done') return;
          if (parsed && (parsed.content || parsed.reasoning)) {
            yield parsed;
          }
        }
      }

      const parsed = parseStreamLine(buffer);
      if (parsed && parsed !== 'done' && (parsed.content || parsed.reasoning)) {
        yield parsed;
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
    let timeoutFired = false;
    const timeoutId = options.timeoutMs ? setTimeout(() => {
      timeoutFired = true;
      controller.abort();
    }, options.timeoutMs) : null;

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
    } catch (error) {
      if (timeoutFired) {
        throw new Error(`Hermes request timed out after ${options.timeoutMs}ms`);
      }
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      releaseAbort?.();
    }
  }
}

export function normalizeHermesReplyText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:')) {
    const chunks = parseSseText(trimmed);
    return chunks.length > 0 ? chunks.join('').trim() : text;
  }

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<HermesChatCompletionResponse>;
      const content = parsed.choices?.[0]?.message?.content;
      return content ? content.trim() : text;
    } catch {
      return text;
    }
  }

  return text;
}

interface HermesSseChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
      thinking?: string;
    };
    message?: {
      content?: string;
      reasoning?: string;
      reasoning_content?: string;
      thinking?: string;
    };
    finish_reason?: string | null;
  }>;
}

function parseChatCompletionText(text: string, contentType: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  if (contentType.includes('text/event-stream') || trimmed.startsWith('data:')) {
    const chunks = parseSseText(trimmed);
    if (chunks.length > 0) return chunks.join('').trim();
  }

  if (contentType.includes('application/json') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as HermesChatCompletionResponse;
      return parsed.choices?.[0]?.message?.content?.trim() ?? '';
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function parseSseText(text: string): string[] {
  const chunks: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseStreamLine(line);
    if (parsed === 'done') break;
    if (parsed?.content) chunks.push(parsed.content);
  }
  return chunks;
}

export interface HermesStreamEvent {
  content?: string;
  reasoning?: string;
}

function parseStreamLine(line: string): HermesStreamEvent | 'done' | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('event:') || trimmed.startsWith(':')) return null;

  const payload = trimmed.startsWith('data:')
    ? trimmed.replace(/^data:\s*/, '')
    : trimmed;
  if (payload === '[DONE]') return 'done';

  try {
    const chunk = JSON.parse(payload) as HermesSseChunk | HermesChatCompletionResponse;
    return extractChatCompletionContent(chunk);
  } catch {
    return null;
  }
}

function extractChatCompletionContent(chunk: HermesSseChunk | HermesChatCompletionResponse): HermesStreamEvent {
  const choice = chunk.choices?.[0];
  if (!choice) return {};
  const deltaContent = 'delta' in choice ? choice.delta?.content : undefined;
  const messageContent = 'message' in choice ? choice.message?.content : undefined;
  const delta = 'delta' in choice ? choice.delta : undefined;
  const message = 'message' in choice ? choice.message : undefined;
  const messageWithReasoning = message as {
    reasoning?: string;
    reasoning_content?: string;
    thinking?: string;
  } | undefined;
  const content = deltaContent ?? messageContent;
  const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking
    ?? messageWithReasoning?.reasoning_content ?? messageWithReasoning?.reasoning ?? messageWithReasoning?.thinking;
  return {
    ...(content ? { content } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}
