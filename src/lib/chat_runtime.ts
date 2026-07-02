import type { AgentPermissionRequest, Attachment, HermesChatMessage, HermesConnection } from '../types';
import { shouldStreamHermesReplies } from './background_agent';
import { extractAgentReplyArtifacts, getAgentReplyFallback } from './chat_rendering';
import { HermesClient } from './hermes_client';
import { runHermesCompletion } from './hermes_completion';

export interface HermesMemberCompletionResult {
  rawText: string;
  content: string;
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
}: {
  connection: HermesConnection;
  messages: HermesChatMessage[];
  sessionId?: string;
  sessionKey?: string;
  timeoutMs: number;
  signal: AbortSignal;
  onChunk?: (content: string) => void;
}): Promise<HermesMemberCompletionResult> {
  const client = new HermesClient(connection);
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
  });

  const parsedReply = extractAgentReplyArtifacts(rawText.trim());
  return {
    rawText,
    content: getAgentReplyFallback(parsedReply),
    attachments: parsedReply.attachments,
    permissionRequest: parsedReply.permissionRequest,
  };
}
