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
}: {
  connection: HermesConnection;
  messages: HermesChatMessage[];
  sessionId?: string;
  sessionKey?: string;
  timeoutMs: number;
  signal: AbortSignal;
  onChunk?: (content: string) => void;
  onProgress?: (progress: { content: string; reasoning?: string }) => void;
}): Promise<HermesMemberCompletionResult> {
  const client = new HermesClient(connection);
  let reasoning = '';
  const rawText = await runHermesCompletion(client, {
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

  const parsedReply = extractAgentReplyArtifacts(rawText.trim());
  return {
    rawText,
    content: getAgentReplyFallback(parsedReply),
    reasoning: reasoning || undefined,
    attachments: parsedReply.attachments,
    permissionRequest: parsedReply.permissionRequest,
  };
}
