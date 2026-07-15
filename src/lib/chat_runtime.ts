import type { AgentPermissionRequest, Attachment, HermesChatMessage, HermesConnection } from '../types';
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
  onProgress?: (progress: { content: string; reasoning?: string }) => void;
  useToolDelegation?: boolean;
}): Promise<HermesMemberCompletionResult> {
  const client = new HermesClient(connection);
  let reasoning = '';
  const responseToolCalls: Array<{ name: string; arguments: string; callId?: string }> = [];
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
        onToolCall: (toolCall) => responseToolCalls.push(toolCall),
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
      onProgress?.(progress);
    },
    });
  }

  const parsedReply = extractAgentReplyArtifacts(rawText.trim());
  return {
    rawText,
    content: getAgentReplyFallback(parsedReply),
    reasoning: reasoning || undefined,
    attachments: parsedReply.attachments,
    permissionRequest: parsedReply.permissionRequest,
    toolCalls: responseToolCalls,
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
    onProgress?: (progress: { content: string; reasoning?: string }) => void;
    onToolCall: (toolCall: { name: string; arguments: string; callId?: string }) => void;
  },
): Promise<string> {
  const instructions = messages.filter((message) => message.role === 'system').map((message) => typeof message.content === 'string' ? message.content : '').filter(Boolean).join('\n\n');
  const input = messages.filter((message) => message.role !== 'system').map((message) => ({ role: message.role, content: message.content }));
  let text = '';
  for await (const event of client.responseStreamEvents({ model: options.model, input, instructions }, options)) {
    if (event.content) {
      text += event.content;
      options.onChunk?.(text);
      options.onProgress?.({ content: text });
    }
    if (event.toolCall) options.onToolCall(event.toolCall);
  }
  return text;
}
