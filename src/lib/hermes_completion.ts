import { HermesClient, normalizeHermesReplyText, type HermesActivityEvent, type HermesStreamEvent } from './hermes_client';
import type { AgentActivityNotice, HermesChatCompletionRequest } from '../types';

export interface RunHermesCompletionOptions {
  request: HermesChatCompletionRequest;
  sessionId?: string;
  sessionKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  stream: boolean;
  onChunk?: (content: string) => void;
  onProgress?: (progress: { content: string; reasoning?: string; activityNotices?: AgentActivityNotice[] }) => void;
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
  const activityNotices = new Map<string, AgentActivityNotice>();
  const eventStream = typeof (client as HermesClient & { chatCompletionStreamEvents?: HermesClient['chatCompletionStreamEvents'] }).chatCompletionStreamEvents === 'function'
    ? client.chatCompletionStreamEvents(request, transportOptions)
    : legacyStreamEvents(client, request, transportOptions);
  for await (const chunk of eventStream) {
    accumulated += chunk.content ?? '';
    reasoning += chunk.reasoning ?? '';
    if (chunk.activity) {
      const notice = makeActivityNotice(chunk.activity);
      const previous = activityNotices.get(notice.id);
      activityNotices.set(notice.id, previous ? { ...previous, ...notice, createdAt: previous.createdAt } : notice);
    }
    options.onChunk?.(accumulated);
    options.onProgress?.({
      content: accumulated,
      reasoning: reasoning || undefined,
      activityNotices: activityNotices.size ? [...activityNotices.values()] : undefined,
    });
  }
  return accumulated;
}

function makeActivityNotice(activity: HermesActivityEvent): AgentActivityNotice {
  const key = activity.id || `${activity.tool ?? 'system'}:${activity.label}`;
  return {
    id: `hermes_${key}`,
    kind: activity.tool ? 'tool' : 'system',
    label: activity.label,
    status: activity.status,
    tool: activity.tool,
    createdAt: new Date().toISOString(),
  };
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
