import { HermesClient, normalizeHermesReplyText } from './hermes_client';
import type { HermesChatCompletionRequest } from '../types';

export interface RunHermesCompletionOptions {
  request: HermesChatCompletionRequest;
  sessionId?: string;
  sessionKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  stream: boolean;
  onChunk?: (content: string) => void;
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
  for await (const chunk of client.chatCompletionStream(request, transportOptions)) {
    accumulated += chunk;
    options.onChunk?.(accumulated);
  }
  return accumulated;
}
