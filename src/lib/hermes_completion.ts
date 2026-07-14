import { HermesClient, normalizeHermesReplyText, type HermesStreamEvent } from './hermes_client';
import type { HermesChatCompletionRequest } from '../types';

export interface RunHermesCompletionOptions {
  request: HermesChatCompletionRequest;
  sessionId?: string;
  sessionKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  stream: boolean;
  onChunk?: (content: string) => void;
  onProgress?: (progress: { content: string; reasoning?: string }) => void;
}

export async function runHermesCompletion(
  client: HermesClient,
  options: RunHermesCompletionOptions,
): Promise<string> {
  const request = { ...options.request, stream: options.stream };
  const transportOptions = {
    sessionId: options.sessionId,
    sessionKey: options.sessionKey,
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  };

  if (!options.stream) {
    const response = await client.chatCompletion(
      { ...request, stream: false },
      transportOptions,
    );
    return normalizeHermesReplyText(response.choices?.[0]?.message?.content ?? '');
  }

  let accumulated = '';
  let reasoning = '';
  const eventStream = typeof (client as HermesClient & { chatCompletionStreamEvents?: HermesClient['chatCompletionStreamEvents'] }).chatCompletionStreamEvents === 'function'
    ? client.chatCompletionStreamEvents(request, transportOptions)
    : legacyStreamEvents(client, request, transportOptions);
  for await (const chunk of eventStream) {
    accumulated += chunk.content ?? '';
    reasoning += chunk.reasoning ?? '';
    options.onChunk?.(accumulated);
    options.onProgress?.({ content: accumulated, reasoning: reasoning || undefined });
  }
  return accumulated;
}

async function* legacyStreamEvents(
  client: HermesClient,
  request: HermesChatCompletionRequest,
  transportOptions: { sessionId?: string; sessionKey?: string; timeoutMs?: number; signal?: AbortSignal },
): AsyncGenerator<HermesStreamEvent, void, undefined> {
  for await (const content of client.chatCompletionStream(request, transportOptions)) {
    yield { content };
  }
}
