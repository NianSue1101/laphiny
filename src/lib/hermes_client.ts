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

export type HermesRequestOptions = {
  sessionId?: string;
  sessionKey?: string;
  timeoutMs?: number;
  connectTimeoutMs?: number;
  idleTimeoutMs?: number;
  signal?: AbortSignal;
};

export interface HermesApiCapabilities {
  object?: string;
  platform?: string;
  model?: string;
  version?: string;
  features?: Record<string, unknown>;
  endpoints?: Record<string, unknown>;
  [key: string]: unknown;
}

export type HermesStreamTerminationKind = 'unexpected_eof' | 'remote_error' | 'incomplete';

export class HermesStreamTerminationError extends Error {
  readonly kind: HermesStreamTerminationKind;

  constructor(kind: HermesStreamTerminationKind, message: string) {
    super(message);
    this.name = 'HermesStreamTerminationError';
    this.kind = kind;
  }
}

export interface HermesRunRequest {
  input: unknown;
  model?: string;
  instructions?: string;
  session_id?: string;
  conversation_history?: Array<{ role: string; content: string }>;
  previous_response_id?: string;
}

export type HermesRunStatusValue =
  | 'queued'
  | 'started'
  | 'running'
  | 'waiting_for_approval'
  | 'stopping'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface HermesRunSubmission {
  run_id: string;
  status: HermesRunStatusValue;
}

export interface HermesRunStatus {
  object?: string;
  run_id: string;
  status: HermesRunStatusValue;
  session_id?: string;
  model?: string;
  output?: string;
  error?: string;
  last_event?: string;
  created_at?: number;
  updated_at?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  [key: string]: unknown;
}

export interface HermesRunEvent {
  event: string;
  runId?: string;
  status?: HermesRunStatusValue;
  content?: string;
  reasoning?: string;
  output?: string;
  error?: string;
  timestamp?: number;
  toolCall?: {
    name: string;
    label?: string;
    callId?: string;
    status: 'running' | 'completed' | 'failed';
  };
  raw: Record<string, unknown>;
}

export class HermesHttpError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string, message?: string) {
    super(message ?? `Hermes HTTP ${status}: ${body}`);
    this.name = 'HermesHttpError';
    this.status = status;
    this.body = body;
  }
}

export function supportsHermesDurableRuns(capabilities: HermesApiCapabilities): boolean {
  return capabilities.features?.run_submission === true
    && capabilities.features?.run_status === true;
}

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

  async capabilities(options?: HermesRequestOptions): Promise<HermesApiCapabilities> {
    return this.request('/v1/capabilities', {
      method: 'GET',
      timeoutMs: options?.timeoutMs,
      connectTimeoutMs: options?.connectTimeoutMs,
      signal: options?.signal,
    });
  }

  async createRun(request: HermesRunRequest, options?: HermesRequestOptions): Promise<HermesRunSubmission> {
    return this.runRequest('/v1/runs', {
      method: 'POST',
      body: JSON.stringify({
        ...request,
        session_id: request.session_id ?? options?.sessionId,
      }),
      contentType: 'application/json',
      ...options,
    });
  }

  async getRun(runId: string, options?: HermesRequestOptions): Promise<HermesRunStatus> {
    return this.runRequest(`/v1/runs/${encodeURIComponent(runId)}`, {
      method: 'GET',
      ...options,
    });
  }

  async stopRun(runId: string, options?: HermesRequestOptions): Promise<HermesRunSubmission> {
    return this.runRequest(`/v1/runs/${encodeURIComponent(runId)}/stop`, {
      method: 'POST',
      ...options,
    });
  }

  async *runEvents(
    runId: string,
    options?: HermesRequestOptions,
  ): AsyncGenerator<HermesRunEvent, void, undefined> {
    const scope = await this.openResponse(`/v1/runs/${encodeURIComponent(runId)}/events`, {
      method: 'GET',
      ...options,
    });
    if (!scope.response.ok) {
      try {
        const body = await readResponseText(scope, options?.idleTimeoutMs ?? options?.timeoutMs);
        throw new HermesHttpError(
          scope.response.status,
          body,
          `Hermes run events failed: ${scope.response.status} ${body || scope.response.statusText}`,
        );
      } finally {
        scope.release();
      }
    }
    if (!scope.response.body?.getReader) {
      scope.release();
      throw new Error('Hermes run events endpoint did not return a readable stream');
    }

    const reader = scope.response.body.getReader();
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
          const event = parseRunStreamEvent(eventName, line.slice(5).trim());
          eventName = '';
          if (event) yield event;
        }
      }
      if (buffer.startsWith('data:')) {
        const event = parseRunStreamEvent(eventName, buffer.slice(5).trim());
        if (event) yield event;
      }
      throwIfExternallyAborted(scope.externalSignal);
    } finally {
      if (!streamEnded && !scope.controller.signal.aborted) {
        try { await reader.cancel(); } catch { /* already closed */ }
      }
      scope.release();
    }
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
    let terminalReceived = false;
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
          if (event?.terminal) {
            terminalReceived = true;
            if (event.terminal.status !== 'completed') {
              throw new HermesStreamTerminationError(
                event.terminal.status === 'incomplete' ? 'incomplete' : 'remote_error',
                event.terminal.error || `Hermes Responses stream ended with ${event.terminal.status}`,
              );
            }
          }
          if (event && hasHermesStreamPayload(event)) yield event;
          eventName = '';
        }
      }
      throwIfExternallyAborted(scope.externalSignal);
      if (!terminalReceived) {
        throw new HermesStreamTerminationError('unexpected_eof', 'Hermes Responses stream closed before a terminal event');
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
    let terminalReceived = false;

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
            terminalReceived = true;
            streamEnded = true;
            return;
          }
          if (parsed?.terminal) {
            terminalReceived = true;
            if (parsed.terminal.status !== 'completed') {
              throw new HermesStreamTerminationError(
                parsed.terminal.status === 'incomplete' ? 'incomplete' : 'remote_error',
                parsed.terminal.error || `Hermes chat stream ended with ${parsed.terminal.status}`,
              );
            }
          }
          if (parsed && hasHermesStreamPayload(parsed)) {
            yield parsed;
          }
        }
      }

      const parsed = parseStreamLine(buffer, eventName);
      if (parsed === 'done') terminalReceived = true;
      if (parsed && parsed !== 'done' && parsed.terminal) {
        terminalReceived = true;
        if (parsed.terminal.status !== 'completed') {
          throw new HermesStreamTerminationError(
            parsed.terminal.status === 'incomplete' ? 'incomplete' : 'remote_error',
            parsed.terminal.error || `Hermes chat stream ended with ${parsed.terminal.status}`,
          );
        }
      }
      if (parsed && parsed !== 'done' && hasHermesStreamPayload(parsed)) {
        yield parsed;
      }

      throwIfExternallyAborted(scope.externalSignal);
      if (!terminalReceived) {
        throw new HermesStreamTerminationError('unexpected_eof', 'Hermes chat stream closed before [DONE] or a finish reason');
      }
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

  private async runRequest<T>(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: string;
      contentType?: string;
    } & HermesRequestOptions,
  ): Promise<T> {
    const scope = await this.openResponse(path, options);
    try {
      const body = await readResponseText(scope, options.idleTimeoutMs ?? options.timeoutMs);
      if (!scope.response.ok) {
        throw new HermesHttpError(
          scope.response.status,
          body,
          `Hermes run API failed: ${scope.response.status} ${body || scope.response.statusText}`,
        );
      }
      return body ? (JSON.parse(body) as T) : ({} as T);
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
          if (options.signal!.aborted) controller.abort();
          else options.signal!.addEventListener('abort', onAbort, { once: true });
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
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
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
  terminal?: { status: 'completed' | 'failed' | 'incomplete'; error?: string };
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
  const finishReason = 'finish_reason' in choice ? choice.finish_reason : undefined;
  const rawError = (chunk as Record<string, any>).error;
  const error = typeof rawError?.message === 'string' ? rawError.message : undefined;
  const terminal = finishReason == null
    ? undefined
    : finishReason === 'stop'
      ? { status: 'completed' as const }
      : finishReason === 'length'
        ? { status: 'incomplete' as const, error: error ?? 'Hermes reply was truncated' }
        : { status: 'failed' as const, error: error ?? `Hermes reply failed (${finishReason})` };
  return {
    ...(content ? { content } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(terminal ? { terminal } : {}),
  };
}

function hasHermesStreamPayload(event: HermesStreamEvent): boolean {
  return Boolean(event.content || event.reasoning || event.toolCall || event.activity);
}

function parseResponseStreamEvent(eventName: string, payload: string): HermesStreamEvent | null {
  try {
    const data = JSON.parse(payload) as Record<string, any>;
    if (eventName === 'response.output_text.delta' && typeof data.delta === 'string') return { content: data.delta };
    if (eventName === 'response.completed') return { terminal: { status: 'completed' } };
    if (eventName === 'response.failed' || eventName === 'response.incomplete') {
      const response = data.response as Record<string, any> | undefined;
      const rawError = data.error ?? response?.error ?? response?.incomplete_details;
      const error = typeof rawError === 'string'
        ? rawError
        : typeof rawError?.message === 'string'
          ? rawError.message
          : eventName === 'response.incomplete' ? 'Hermes response was incomplete' : 'Hermes response failed';
      return { terminal: { status: eventName === 'response.incomplete' ? 'incomplete' : 'failed', error } };
    }
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

function parseRunStreamEvent(eventName: string, payload: string): HermesRunEvent | null {
  if (!payload || payload === '[DONE]') return null;
  try {
    const raw = JSON.parse(payload) as Record<string, unknown>;
    const event = typeof raw.event === 'string' ? raw.event : eventName;
    if (!event) return null;
    const runId = typeof raw.run_id === 'string' ? raw.run_id : undefined;
    const timestamp = typeof raw.timestamp === 'number' ? raw.timestamp : undefined;
    const base = { event, runId, timestamp, raw };

    if (event === 'message.delta') {
      return {
        ...base,
        content: typeof raw.delta === 'string' ? raw.delta : '',
      };
    }
    if (event === 'reasoning.available') {
      return {
        ...base,
        reasoning: typeof raw.text === 'string' ? raw.text : '',
      };
    }
    if (event === 'tool.started' || event === 'tool.completed') {
      const name = typeof raw.tool === 'string' ? raw.tool : 'unknown';
      const failed = event === 'tool.completed' && raw.error === true;
      return {
        ...base,
        toolCall: {
          name,
          label: typeof raw.preview === 'string' ? raw.preview : undefined,
          callId: typeof raw.tool_call_id === 'string' ? raw.tool_call_id : undefined,
          status: event === 'tool.started' ? 'running' : failed ? 'failed' : 'completed',
        },
        error: failed ? `${name} failed` : undefined,
      };
    }
    if (event === 'run.completed') {
      return {
        ...base,
        status: 'completed',
        output: typeof raw.output === 'string' ? raw.output : '',
      };
    }
    if (event === 'run.failed') {
      return {
        ...base,
        status: 'failed',
        error: typeof raw.error === 'string' ? raw.error : 'Hermes run failed',
      };
    }
    if (event === 'run.cancelled') return { ...base, status: 'cancelled' };
    if (event === 'run.started') return { ...base, status: 'started' };
    if (event === 'approval.request') return { ...base, status: 'waiting_for_approval' };
    return base;
  } catch {
    return null;
  }
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
