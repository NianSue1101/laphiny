import {
  HermesChatCompletionRequest,
  HermesChatCompletionResponse,
  HermesConnection,
  HermesHealthResponse,
  HermesModel,
  HermesModelsResponse,
} from '../types';
import { getRuntimeFetch } from './runtime_fetch';
import { evaluateHermesToolDelegationSupport, type HermesToolDelegationSupport } from './hermes_capabilities';

export type HermesTransportErrorKind = 'connect_timeout' | 'stream_idle_timeout';

export class HermesTransportError extends Error {
  readonly kind: HermesTransportErrorKind;

  constructor(kind: HermesTransportErrorKind, message: string) {
    super(message);
    this.name = 'HermesTransportError';
    this.kind = kind;
  }
}

type HermesRequestOptions = {
  sessionId?: string;
  sessionKey?: string;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
};

type HermesResponseScope = {
  response: Response;
  controller: AbortController;
  release: () => void;
  externalSignal?: AbortSignal;
};

export class HermesClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(connection: Pick<HermesConnection, 'baseUrl' | 'apiKey'>, fetchImpl?: typeof globalThis.fetch) {
    this.baseUrl = connection.baseUrl.trim().replace(/\/+$/, '');
    this.apiKey = connection.apiKey.trim();
    this.fetchImpl = fetchImpl ?? getRuntimeFetch();
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
    options?: HermesRequestOptions,
  ): Promise<HermesChatCompletionResponse> {
    return this.request('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
      contentType: 'application/json',
      sessionId: options?.sessionId,
      sessionKey: options?.sessionKey,
      timeoutMs: options?.timeoutMs,
      connectTimeoutMs: options?.connectTimeoutMs,
      signal: options?.signal,
    });
  }

  async *chatCompletionStream(
    request: HermesChatCompletionRequest,
    options?: HermesRequestOptions,
  ): AsyncGenerator<string, void, undefined> {
    for await (const event of this.chatCompletionStreamEvents(request, options)) {
      if (event.content) yield event.content;
    }
  }

  async requestPublic<T>(path: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<T> {
    return this.request(path, { method: 'GET', timeoutMs: options?.timeoutMs, signal: options?.signal });
  }

  async *responseStreamEvents(
    request: HermesResponseRequest,
    options?: HermesRequestOptions,
  ): AsyncGenerator<HermesStreamEvent, void, undefined> {
    const scope = await this.openResponse('/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ ...request, stream: true, store: false }),
      contentType: 'application/json',
      sessionId: options?.sessionId,
      sessionKey: options?.sessionKey,
      timeoutMs: options?.timeoutMs,
      connectTimeoutMs: options?.connectTimeoutMs,
      signal: options?.signal,
    });
    const { response } = scope;
    if (!response.ok) {
      try { throw new Error(`Hermes Responses API failed: ${response.status} ${await response.text()}`); }
      finally { scope.release(); }
    }
    if (!response.body?.getReader) {
      scope.release();
      throw new Error('Hermes Responses API did not return a readable stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let eventName = '';
    let streamEnded = false;
    try {
      while (true) {
        const { done, value } = await readStreamChunk(reader, scope, options?.idleTimeoutMs ?? options?.timeoutMs);
        if (done) {
          streamEnded = true;
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/u);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          if (!line.startsWith('data:')) continue;
          const event = parseResponseStreamEvent(eventName, line.slice(5).trim());
          if (event) yield event;
          eventName = '';
        }
      }
    } finally {
      // React Native's stream polyfill can throw asynchronously when cancel()
      // races a natural close or an AbortController-driven close. Only cancel
      // when the consumer stopped early and the request itself is still live.
      if (!streamEnded && !scope.controller.signal.aborted) {
        try { await reader.cancel(); } catch { /* already closed */ }
      }
      scope.release();
    }
  }

  async *chatCompletionStreamEvents(
    request: HermesChatCompletionRequest,
    options?: HermesRequestOptions,
  ): AsyncGenerator<HermesStreamEvent, void, undefined> {
    const scope = await this.openResponse('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify(request),
      contentType: 'application/json',
      sessionId: options?.sessionId,
      sessionKey: options?.sessionKey,
      timeoutMs: options?.timeoutMs,
      connectTimeoutMs: options?.connectTimeoutMs,
      signal: options?.signal,
    });
    const { response } = scope;

    if (!response.ok) {
      try {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      } finally {
        scope.release();
      }
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!response.body?.getReader) {
      try {
        const text = await response.text();
        const completion = parseChatCompletionText(text, contentType);
        if (completion) yield { content: completion };
        return;
      } finally {
        scope.release();
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let eventName = '';
    let streamEnded = false;

    try {
      while (true) {
        const { done, value } = await readStreamChunk(reader, scope, options?.idleTimeoutMs ?? options?.timeoutMs);
        if (done) {
          streamEnded = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
            continue;
          }
          const parsed = parseStreamLine(line, eventName);
          if (line.trim().startsWith('data:')) eventName = '';
          if (parsed === 'done') {
            streamEnded = true;
            return;
          }
          if (parsed && hasHermesStreamPayload(parsed)) {
            yield parsed;
          }
        }
      }

      const parsed = parseStreamLine(buffer, eventName);
      if (parsed && parsed !== 'done' && hasHermesStreamPayload(parsed)) {
        yield parsed;
      }

      throwIfExternallyAborted(scope.externalSignal);
    } finally {
      if (!streamEnded && !scope.controller.signal.aborted) {
        try {
          await reader.cancel();
        } catch {
          // The reader may already be closed or canceled.
        }
      }
      scope.release();
    }
  }

  private async request<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      contentType?: string;
    } & HermesRequestOptions,
  ): Promise<T> {
    const scope = await this.openResponse(path, options);
    try {
      const text = await readResponseText(scope, options.timeoutMs);
      if (!scope.response.ok) {
        throw new Error(`HTTP ${scope.response.status}: ${text || scope.response.statusText}`);
      }
      return text ? (JSON.parse(text) as T) : ({} as T);
    } finally {
      scope.release();
    }
  }

  private async openResponse(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      contentType?: string;
    } & HermesRequestOptions,
  ): Promise<HermesResponseScope> {
    const controller = new AbortController();
    let timeoutFired = false;
    const connectTimeoutMs = options.connectTimeoutMs ?? options.timeoutMs;
    const timeoutId = connectTimeoutMs ? setTimeout(() => {
      timeoutFired = true;
      controller.abort();
    }, connectTimeoutMs) : null;

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
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      return {
        response,
        controller,
        externalSignal: options.signal,
        release: () => releaseAbort?.(),
      };
    } catch (error) {
      if (timeoutId) clearTimeout(timeoutId);
      releaseAbort?.();
      if (timeoutFired) {
        throw new HermesTransportError('connect_timeout', `Hermes connection timed out after ${connectTimeoutMs}ms`);
      }
      throw error;
    }
  }
}

async function readResponseText(scope: HermesResponseScope, idleTimeoutMs?: number): Promise<string> {
  if (!idleTimeoutMs) return scope.response.text();
  return raceWithIdleTimeout(scope.response.text(), scope, idleTimeoutMs);
}

async function readStreamChunk(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  scope: HermesResponseScope,
  idleTimeoutMs?: number,
): Promise<ReadableStreamReadResult<Uint8Array>> {
  throwIfExternallyAborted(scope.externalSignal);
  const result = idleTimeoutMs
    ? await raceWithIdleTimeout(reader.read(), scope, idleTimeoutMs)
    : await reader.read();
  throwIfExternallyAborted(scope.externalSignal);
  return result;
}

function raceWithIdleTimeout<T>(promise: Promise<T>, scope: HermesResponseScope, idleTimeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      scope.controller.abort();
      reject(new HermesTransportError('stream_idle_timeout', `Hermes response stream was idle for ${idleTimeoutMs}ms`));
    }, idleTimeoutMs);
    promise.then(
      (value) => { clearTimeout(timeoutId); resolve(value); },
      (error) => { clearTimeout(timeoutId); reject(error); },
    );
  });
}

function throwIfExternallyAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('The operation was aborted', 'AbortError');
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
  toolCall?: { name: string; arguments: string; callId?: string; status?: 'running' | 'completed' };
  activity?: HermesActivityEvent;
}

export interface HermesActivityEvent {
  id?: string;
  tool?: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'info';
}

export interface HermesResponseRequest {
  model: string;
  input: unknown;
  instructions?: string;
  stream?: boolean;
  store?: boolean;
}

export async function getHermesToolDelegationSupport(client: HermesClient, timeoutMs = 8_000): Promise<HermesToolDelegationSupport> {
  try {
    const [capabilities, toolsets] = await Promise.all([
      client.requestPublic<Record<string, any>>('/v1/capabilities', { timeoutMs }),
      client.requestPublic<unknown>('/v1/toolsets', { timeoutMs }),
    ]);
    return evaluateHermesToolDelegationSupport(capabilities, toolsets);
  } catch (error) {
    return {
      supported: false,
      compatibility: 'probe_failed',
      protocol: 'laphiny.delegation.v1',
      reasonCode: 'capability_probe_failed',
      reason: error instanceof Error ? error.message : String(error),
      suggestedFix: '请检查 Gateway 版本、插件状态和 /v1/capabilities、/v1/toolsets 端点。',
    };
  }
}

function parseStreamLine(line: string, eventName = ''): HermesStreamEvent | 'done' | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('event:') || trimmed.startsWith(':')) return null;

  const payload = trimmed.startsWith('data:')
    ? trimmed.replace(/^data:\s*/, '')
    : trimmed;
  if (payload === '[DONE]') return 'done';

  try {
    if (eventName === 'hermes.tool.progress') {
      const progress = JSON.parse(payload) as Record<string, unknown>;
      const tool = typeof progress.tool === 'string' ? progress.tool : undefined;
      const label = typeof progress.label === 'string' && progress.label.trim()
        ? progress.label.trim()
        : tool ? `正在使用 ${tool}` : 'Hermes 正在处理';
      const rawStatus = typeof progress.status === 'string' ? progress.status.toLowerCase() : 'running';
      const status: HermesActivityEvent['status'] = rawStatus === 'completed' || rawStatus === 'done'
        ? 'completed'
        : rawStatus === 'failed' || rawStatus === 'error'
          ? 'failed'
          : rawStatus === 'running' || rawStatus === 'started'
            ? 'running'
            : 'info';
      const id = typeof progress.toolCallId === 'string'
        ? progress.toolCallId
        : typeof progress.tool_call_id === 'string'
          ? progress.tool_call_id
          : undefined;
      return { activity: { id, tool, label, status } };
    }
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

function hasHermesStreamPayload(event: HermesStreamEvent): boolean {
  return Boolean(event.content || event.reasoning || event.toolCall || event.activity);
}

function parseResponseStreamEvent(eventName: string, payload: string): HermesStreamEvent | null {
  try {
    const data = JSON.parse(payload) as Record<string, any>;
    if (eventName === 'response.output_text.delta' && typeof data.delta === 'string') return { content: data.delta };
    const item = data.item as Record<string, any> | undefined;
    if ((eventName === 'response.output_item.added' || eventName === 'response.output_item.done')
      && item?.type === 'function_call'
      && typeof item.name === 'string'
      && typeof item.arguments === 'string') {
      const status = eventName === 'response.output_item.done' ? 'completed' : 'running';
      const callId = typeof item.call_id === 'string' ? item.call_id : undefined;
      return {
        toolCall: { name: item.name, arguments: item.arguments, callId, status },
        activity: {
          id: callId,
          tool: item.name,
          label: describeToolActivity(item.name, item.arguments, status),
          status,
        },
      };
    }
  } catch {
    // Ignore malformed SSE frames; a final completion/error frame still decides the request outcome.
  }
  return null;
}

function describeToolActivity(tool: string, rawArguments: string, status: 'running' | 'completed'): string {
  let subject = '';
  try {
    const args = JSON.parse(rawArguments) as Record<string, unknown>;
    subject = [args.skill, args.name, args.target, args.action]
      .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))?.trim() ?? '';
  } catch {
    // The tool name is still useful when arguments are partial or malformed.
  }
  const prefix = status === 'completed' ? '已完成' : '正在执行';
  return `${prefix} ${tool}${subject ? ` · ${subject}` : ''}`;
}
