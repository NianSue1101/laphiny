import type { AgentActivityNotice, AgentPermissionRequest, Attachment, HermesChatMessage, HermesConnection } from '../types';
import { shouldStreamHermesReplies } from './background_agent';
import { extractAgentReplyArtifacts, getAgentReplyFallback } from './chat_rendering';
import { HermesClient } from './hermes_client';
import { runHermesCompletion } from './hermes_completion';

export interface HermesMemberCompletionResult {
  rawText: string;
  content: string;
  reasoning?: string;
  attachments: Attachment[];
  permissionRequest?: AgentPermissionRequest;
  activityNotices?: AgentActivityNotice[];
  toolCalls?: Array<{ name: string; arguments: string; callId?: string }>;
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
  useToolDelegation?: boolean;
}): Promise<HermesMemberCompletionResult> {
  const client = new HermesClient(connection);
  let reasoning = '';
  let activityNotices: AgentActivityNotice[] | undefined;
  const responseToolCalls = new Map<string, { name: string; arguments: string; callId?: string }>();
  let rawText = '';
  if (useToolDelegation) {
    try {
      rawText = await runHermesResponsesCompletion(client, messages, {
        model: connection.model,
        sessionId,
        sessionKey,
        timeoutMs,
        signal,
        onChunk,
        onProgress,
        onToolCall: (toolCall) => responseToolCalls.set(toolCall.callId || `${toolCall.name}:${toolCall.arguments}`, toolCall),
      });
    } catch {
      // Capability metadata can become stale after a Gateway downgrade.
      // Preserve chat availability by returning to the compatible endpoint.
      rawText = await runHermesCompletion(client, {
        request: {
          model: connection.model,
          messages,
        },
        sessionId,
        sessionKey,
        timeoutMs,
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
  } else {
    rawText = await runHermesCompletion(client, {
    request: {
      model: connection.model,
      messages,
    },
    sessionId,
    sessionKey,
    timeoutMs,
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

  const parsedReply = extractAgentReplyArtifacts(rawText.trim());
  return {
    rawText,
    content: getAgentReplyFallback(parsedReply),
    reasoning: reasoning || undefined,
    activityNotices,
    attachments: parsedReply.attachments,
    permissionRequest: parsedReply.permissionRequest,
    toolCalls: [...responseToolCalls.values()],
  };
}

async function runHermesResponsesCompletion(
  client: HermesClient,
  messages: HermesChatMessage[],
  options: {
    model: string;
    sessionId?: string;
    sessionKey?: string;
    timeoutMs: number;
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
  for await (const event of client.responseStreamEvents({ model: options.model, input, instructions }, options)) {
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
