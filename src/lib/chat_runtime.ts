import type { AgentActivityNotice, AgentPermissionRequest, Attachment, HermesChatMessage, HermesConnection } from '../types';
import { shouldStreamHermesReplies } from './background_agent';
import { extractAgentReplyArtifacts, getAgentReplyFallback } from './chat_rendering';
import { HermesClient, HermesHttpError, HermesTransportError } from './hermes_client';
import { runHermesCompletion } from './hermes_completion';
import { connectionSupportsDurableRuns, runOrResumeHermesDurableCompletion } from './hermes_runs';

export interface HermesMemberCompletionResult {
  rawText: string;
  content: string;
  reasoning?: string;
  attachments: Attachment[];
  permissionRequest?: AgentPermissionRequest;
  activityNotices?: AgentActivityNotice[];
  toolCalls?: Array<{ name: string; arguments: string; callId?: string }>;
  hermesRunId?: string;
  hermesTransport: 'runs' | 'stream';
}

export async function runHermesMemberCompletion({
  connection,
  messages,
  sessionId,
  sessionKey,
  timeoutMs,
  signal,
  onChunk,
  onProgress,
  onRunSubmitted,
  resumeRunId,
  useToolDelegation = false,
}: {
  connection: HermesConnection;
  messages: HermesChatMessage[];
  sessionId?: string;
  sessionKey?: string;
  timeoutMs: number;
  signal: AbortSignal;
  onChunk?: (content: string) => void;
  onProgress?: (progress: { content: string; reasoning?: string; activityNotices?: AgentActivityNotice[] }) => void;
  onRunSubmitted?: (runId: string) => void;
  resumeRunId?: string;
  useToolDelegation?: boolean;
}): Promise<HermesMemberCompletionResult> {
  const client = new HermesClient(connection);
  const connectTimeoutMs = Math.min(30_000, timeoutMs);
  const idleTimeoutMs = timeoutMs;
  let reasoning = '';
  let activityNotices: AgentActivityNotice[] | undefined;
  const responseToolCalls = new Map<string, { name: string; arguments: string; callId?: string }>();
  let rawText = '';
  let hermesRunId: string | undefined;
  let hermesTransport: HermesMemberCompletionResult['hermesTransport'] = 'stream';

  const durableRunsSupported = Boolean(resumeRunId) || await connectionSupportsDurableRuns(connection, signal);
  if (durableRunsSupported) {
    try {
      const durableResult = await runOrResumeHermesDurableCompletion({
        connection,
        messages: resumeRunId ? undefined : messages,
        runId: resumeRunId,
        sessionId,
        sessionKey,
        signal,
        onRunSubmitted: (runId) => {
          hermesRunId = runId;
          onRunSubmitted?.(runId);
        },
        onProgress: (progress) => {
          reasoning = progress.reasoning ?? reasoning;
          activityNotices = progress.activityNotices ?? activityNotices;
          onChunk?.(progress.content);
          onProgress?.(progress);
        },
      });
      rawText = durableResult.content;
      reasoning = durableResult.reasoning ?? reasoning;
      activityNotices = durableResult.activityNotices ?? activityNotices;
      for (const toolCall of durableResult.toolCalls) {
        responseToolCalls.set(toolCall.callId || `${toolCall.name}:${toolCall.arguments}`, toolCall);
      }
      hermesRunId = durableResult.runId;
      hermesTransport = 'runs';
    } catch (error) {
      const endpointUnavailable = !resumeRunId
        && error instanceof HermesHttpError
        && [404, 405, 501].includes(error.status);
      if (!endpointUnavailable) throw error;
      // Capability data may be stale after a Gateway downgrade. A definitive
      // method-not-supported response occurs before a run exists, so fallback
      // does not risk duplicating accepted work.
    }
  }

  if (!rawText && hermesTransport !== 'runs') {
  if (useToolDelegation) {
    try {
      rawText = await runHermesResponsesCompletion(client, messages, {
        model: connection.model,
        sessionId,
        sessionKey,
          timeoutMs,
          connectTimeoutMs,
          idleTimeoutMs,
        signal,
        onChunk,
        onProgress,
        onToolCall: (toolCall) => responseToolCalls.set(toolCall.callId || `${toolCall.name}:${toolCall.arguments}`, toolCall),
      });
    } catch (error) {
      if (!isResponsesCompatibilityFailure(error)) throw error;
      // Capability metadata can become stale after a Gateway downgrade.
      // Preserve chat availability by returning to the compatible endpoint.
      const compatibilityNotice: AgentActivityNotice = {
        id: `compatibility_${connection.id}`,
        kind: 'system',
        label: '工具委托接口不兼容，已切换普通聊天；请重新测试连接或更新插件。',
        status: 'failed',
        createdAt: new Date().toISOString(),
      };
      activityNotices = [compatibilityNotice];
      onProgress?.({ content: rawText, activityNotices });
      rawText = await runHermesCompletion(client, {
        request: {
          model: connection.model,
          messages,
        },
        sessionId,
        sessionKey,
        timeoutMs,
        connectTimeoutMs,
        idleTimeoutMs,
        signal,
        stream: shouldStreamHermesReplies(),
        onChunk,
        onProgress: (progress) => {
          reasoning = progress.reasoning ?? reasoning;
          activityNotices = mergeActivityNotices(activityNotices, progress.activityNotices);
          onProgress?.({ ...progress, activityNotices });
        },
      });
    }
  } else {
    rawText = await runHermesCompletion(client, {
    request: {
      model: connection.model,
      messages,
    },
    sessionId,
    sessionKey,
    timeoutMs,
    connectTimeoutMs,
    idleTimeoutMs,
    signal,
    stream: shouldStreamHermesReplies(),
    onChunk,
    onProgress: (progress) => {
      reasoning = progress.reasoning ?? reasoning;
      activityNotices = progress.activityNotices ?? activityNotices;
      onProgress?.(progress);
    },
    });
  }
  }

  const parsedReply = extractAgentReplyArtifacts(rawText.trim());
  return {
    rawText,
    content: getAgentReplyFallback(parsedReply),
    reasoning: reasoning || undefined,
    activityNotices,
    attachments: parsedReply.attachments,
    permissionRequest: parsedReply.permissionRequest,
    toolCalls: [...responseToolCalls.values()],
    hermesRunId,
    hermesTransport,
  };
}

function mergeActivityNotices(
  current?: AgentActivityNotice[],
  incoming?: AgentActivityNotice[],
): AgentActivityNotice[] | undefined {
  if (!current?.length) return incoming;
  if (!incoming?.length) return current;
  const byId = new Map(current.map((notice) => [notice.id, notice]));
  for (const notice of incoming) byId.set(notice.id, notice);
  return [...byId.values()];
}

function isResponsesCompatibilityFailure(error: unknown): boolean {
  if (error instanceof HermesTransportError) return false;
  if (error instanceof Error && error.name === 'AbortError') return false;
  const message = error instanceof Error ? error.message : String(error);
  return /Responses API failed:\s*(400|404|405|415|422)\b|did not return a readable stream/iu.test(message);
}

async function runHermesResponsesCompletion(
  client: HermesClient,
  messages: HermesChatMessage[],
  options: {
    model: string;
    sessionId?: string;
    sessionKey?: string;
    timeoutMs: number;
    connectTimeoutMs?: number;
    idleTimeoutMs?: number;
    signal: AbortSignal;
    onChunk?: (content: string) => void;
    onProgress?: (progress: { content: string; reasoning?: string; activityNotices?: AgentActivityNotice[] }) => void;
    onToolCall: (toolCall: { name: string; arguments: string; callId?: string }) => void;
  },
): Promise<string> {
  const instructions = messages.filter((message) => message.role === 'system').map((message) => typeof message.content === 'string' ? message.content : '').filter(Boolean).join('\n\n');
  const input = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content }));
  let text = '';
  const activityNotices = new Map<string, AgentActivityNotice>();
  for await (const event of client.responseStreamEvents({ model: options.model, input, instructions }, {
    sessionId: options.sessionId,
    sessionKey: options.sessionKey,
    timeoutMs: options.timeoutMs,
    connectTimeoutMs: options.connectTimeoutMs,
    idleTimeoutMs: options.idleTimeoutMs,
    signal: options.signal,
  })) {
    if (event.content) {
      text += event.content;
      options.onChunk?.(text);
      options.onProgress?.({ content: text, activityNotices: activityNotices.size ? [...activityNotices.values()] : undefined });
    }
    if (event.activity) {
      const id = `hermes_${event.activity.id || `${event.activity.tool ?? 'system'}:${event.activity.label}`}`;
      const previous = activityNotices.get(id);
      activityNotices.set(id, {
        id,
        kind: event.activity.tool ? 'tool' : 'system',
        label: event.activity.label,
        status: event.activity.status,
        tool: event.activity.tool,
        createdAt: previous?.createdAt ?? new Date().toISOString(),
      });
      options.onProgress?.({ content: text, activityNotices: [...activityNotices.values()] });
    }
    if (event.toolCall) {
      const { status: _status, ...toolCall } = event.toolCall;
      options.onToolCall(toolCall);
    }
  }
  return text;
}
