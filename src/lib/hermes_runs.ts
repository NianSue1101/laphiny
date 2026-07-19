import type { AgentActivityNotice, HermesChatMessage, HermesConnection } from '../types';
import {
  HermesClient,
  HermesHttpError,
  type HermesRunEvent,
  type HermesRunStatus,
  supportsHermesDurableRuns,
} from './hermes_client';

const CAPABILITY_CACHE_MS = 5 * 60_000;
const RUN_STATUS_RETENTION_BUDGET_MS = 55 * 60_000;
const capabilityCache = new Map<string, { supported: boolean; expiresAt: number }>();

export interface HermesDurableRunProgress {
  content: string;
  reasoning?: string;
  activityNotices?: AgentActivityNotice[];
}

export interface HermesDurableRunResult extends HermesDurableRunProgress {
  runId: string;
  toolCalls: Array<{ name: string; arguments: string; callId?: string }>;
}

export async function connectionSupportsDurableRuns(
  connection: HermesConnection,
  signal?: AbortSignal,
): Promise<boolean> {
  const key = `${connection.id}:${connection.baseUrl.trim()}`;
  const cached = capabilityCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.supported;

  try {
    const capabilities = await new HermesClient(connection).capabilities({
      connectTimeoutMs: 8_000,
      timeoutMs: 8_000,
      signal,
    });
    const supported = supportsHermesDurableRuns(capabilities);
    capabilityCache.set(key, { supported, expiresAt: Date.now() + CAPABILITY_CACHE_MS });
    return supported;
  } catch (error) {
    if (signal?.aborted) throw error;
    capabilityCache.set(key, { supported: false, expiresAt: Date.now() + 30_000 });
    return false;
  }
}

export async function runOrResumeHermesDurableCompletion(options: {
  connection: HermesConnection;
  messages?: HermesChatMessage[];
  runId?: string;
  sessionId?: string;
  sessionKey?: string;
  signal: AbortSignal;
  onRunSubmitted?: (runId: string) => void;
  onProgress?: (progress: HermesDurableRunProgress) => void;
}): Promise<HermesDurableRunResult> {
  const client = new HermesClient(options.connection);
  let runId = options.runId;
  if (!runId) {
    const messages = options.messages ?? [];
    const instructions = messages
      .filter((message) => message.role === 'system' && typeof message.content === 'string')
      .map((message) => message.content as string)
      .filter(Boolean)
      .join('\n\n');
    const input = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role, content: message.content }));
    const submission = await client.createRun({
      model: options.connection.model,
      input,
      instructions: instructions || undefined,
      session_id: options.sessionId,
    }, {
      sessionId: options.sessionId,
      sessionKey: options.sessionKey,
      connectTimeoutMs: 30_000,
      timeoutMs: 30_000,
      signal: options.signal,
    });
    runId = submission.run_id;
    if (!runId) throw new Error('Hermes durable run submission did not return run_id');
    options.onRunSubmitted?.(runId);
  } else {
    options.onRunSubmitted?.(runId);
  }

  let content = '';
  let reasoning = '';
  const activityNotices = new Map<string, AgentActivityNotice>();
  const toolCalls = new Map<string, { name: string; arguments: string; callId?: string }>();
  let terminalStatus: HermesRunStatus | null = null;

  const emitProgress = () => options.onProgress?.({
    content,
    reasoning: reasoning || undefined,
    activityNotices: activityNotices.size ? [...activityNotices.values()] : undefined,
  });

  // A resumed task may have completed while the app was offline or suspended.
  // Reconcile status before opening another event stream so foreground recovery
  // does not wait for an empty/replayed SSE subscription to time out.
  if (options.runId) {
    try {
      terminalStatus = await client.getRun(runId, {
        sessionKey: options.sessionKey,
        connectTimeoutMs: 12_000,
        timeoutMs: 20_000,
        signal: options.signal,
      });
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (error instanceof HermesHttpError && error.status === 404) throw error;
      // A transient status failure is not terminal. The event stream and the
      // bounded polling loop below provide independent recovery paths.
    }
  }

  try {
    try {
      if (isTerminalRunStatus(terminalStatus)) {
        // The authoritative result was already recovered by the status probe.
      } else {
        for await (const event of client.runEvents(runId, {
          sessionKey: options.sessionKey,
          connectTimeoutMs: 30_000,
          idleTimeoutMs: 75_000,
          signal: options.signal,
        })) {
          if (event.content) content += event.content;
          if (event.reasoning) reasoning += event.reasoning;
          mergeRunActivity(activityNotices, event);
          mergeRunToolCall(toolCalls, event);
          if (event.content || event.reasoning || event.toolCall) emitProgress();
          if (event.status === 'completed' || event.status === 'failed' || event.status === 'cancelled') break;
        }
      }
    } catch (error) {
      // A detached Runs API task keeps executing. Losing its optional event
      // stream is recoverable; the authoritative final output comes from GET.
      if (options.signal.aborted) throw error;
      if (error instanceof HermesHttpError && error.status === 404) {
        // Some gateways discard the event buffer when a previous subscriber
        // disconnected. The status endpoint remains authoritative.
      }
    }

    if (!isTerminalRunStatus(terminalStatus)) {
      terminalStatus = await pollRunStatus(client, runId, options);
    }
  } catch (error) {
    if (options.signal.aborted) {
      try {
        await client.stopRun(runId, { sessionKey: options.sessionKey, timeoutMs: 8_000 });
      } catch {
        // The local cancellation remains authoritative even if the host is offline.
      }
    }
    throw error;
  }

  if (!terminalStatus) {
    throw new Error('Hermes durable run status could not be reconciled');
  }
  if (terminalStatus.status === 'failed') {
    throw new Error(terminalStatus.error || 'Hermes durable run failed');
  }
  if (terminalStatus.status === 'cancelled') {
    const error = new Error('Hermes durable run was cancelled');
    error.name = 'AbortError';
    throw error;
  }
  if (terminalStatus.status !== 'completed') {
    throw new Error(`Hermes durable run ended in unexpected state: ${terminalStatus.status}`);
  }

  content = terminalStatus.output ?? content;
  emitProgress();
  return {
    runId,
    content,
    reasoning: reasoning || undefined,
    activityNotices: activityNotices.size ? [...activityNotices.values()] : undefined,
    toolCalls: [...toolCalls.values()],
  };
}

function isTerminalRunStatus(status: HermesRunStatus | null): status is HermesRunStatus {
  return status?.status === 'completed' || status?.status === 'failed' || status?.status === 'cancelled';
}

async function pollRunStatus(
  client: HermesClient,
  runId: string,
  options: { sessionKey?: string; signal: AbortSignal },
): Promise<HermesRunStatus> {
  const startedAt = Date.now();
  let delayMs = 750;
  let lastError: unknown;
  while (Date.now() - startedAt < RUN_STATUS_RETENTION_BUDGET_MS) {
    throwIfAborted(options.signal);
    try {
      const status = await client.getRun(runId, {
        sessionKey: options.sessionKey,
        connectTimeoutMs: 12_000,
        timeoutMs: 20_000,
        signal: options.signal,
      });
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') return status;
      lastError = undefined;
      delayMs = Math.min(5_000, Math.max(750, Math.round(delayMs * 1.35)));
    } catch (error) {
      if (options.signal.aborted) throw error;
      if (error instanceof HermesHttpError && error.status === 404) throw error;
      lastError = error;
      delayMs = Math.min(15_000, Math.max(1_500, Math.round(delayMs * 1.8)));
    }
    await abortableDelay(delayMs, options.signal);
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Hermes durable run could not be reconciled before its status retention window expired');
}

function mergeRunActivity(target: Map<string, AgentActivityNotice>, event: HermesRunEvent) {
  if (!event.toolCall) return;
  const id = `hermes_run_${event.toolCall.callId || event.toolCall.name}`;
  const previous = target.get(id);
  target.set(id, {
    id,
    kind: 'tool',
    label: event.toolCall.label || `${event.toolCall.name} ${event.toolCall.status === 'running' ? '执行中' : event.toolCall.status === 'failed' ? '失败' : '已完成'}`,
    status: event.toolCall.status,
    tool: event.toolCall.name,
    createdAt: previous?.createdAt ?? new Date().toISOString(),
  });
}

function mergeRunToolCall(
  target: Map<string, { name: string; arguments: string; callId?: string }>,
  event: HermesRunEvent,
) {
  if (!event.toolCall) return;
  const rawArguments = event.raw.arguments ?? event.raw.args;
  if (rawArguments == null) return;
  const argumentsText = typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments);
  const call = { name: event.toolCall.name, arguments: argumentsText, callId: event.toolCall.callId };
  target.set(event.toolCall.callId || `${call.name}:${call.arguments}`, call);
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  throw error;
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      try {
        throwIfAborted(signal);
      } catch (error) {
        reject(error);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
