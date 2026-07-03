import type { AgentPermissionRequest, Attachment, ChatMessage } from '../types';
import { extractAgentFileAttachments } from './agent_files';
import { extractAgentPermissionRequest } from './agent_permissions';

export interface ParsedAgentReplyArtifacts {
  content: string;
  attachments: Attachment[];
  permissionRequest?: AgentPermissionRequest;
}

export interface RenderableMessageArtifacts {
  content: string;
  attachments: Attachment[];
}

export function extractAgentReplyArtifacts(rawContent: string): ParsedAgentReplyArtifacts {
  const fileReply = extractAgentFileAttachments(rawContent);
  const permissionReply = extractAgentPermissionRequest(fileReply.content);
  return {
    content: permissionReply.content,
    attachments: fileReply.attachments,
    permissionRequest: permissionReply.request,
  };
}

export function getRenderableMessageArtifacts(message: ChatMessage): RenderableMessageArtifacts {
  const currentAttachments = message.attachments ?? [];
  if (message.authorId === 'user') return { content: message.content, attachments: currentAttachments };

  const fileReply = extractAgentFileAttachments(message.content);
  if (!fileReply.attachments.length) return { content: message.content, attachments: currentAttachments };

  return {
    content: fileReply.content || (currentAttachments.length || fileReply.attachments.length ? '已生成附件' : message.content),
    attachments: mergeRenderableAttachments(currentAttachments, fileReply.attachments),
  };
}

export function getAgentReplyFallback(parsedReply: ParsedAgentReplyArtifacts): string {
  if (parsedReply.content) return parsedReply.content;
  if (parsedReply.permissionRequest) return parsedReply.permissionRequest.body;
  if (parsedReply.attachments.length) return '已生成附件';
  return '[Hermes 没有返回内容]';
}

function mergeRenderableAttachments(current: Attachment[], extracted: Attachment[]): Attachment[] {
  const seen = new Set(current.map((attachment) => `${attachment.name}:${attachment.size}:${attachment.kind}`));
  const merged = [...current];
  for (const attachment of extracted) {
    const key = `${attachment.name}:${attachment.size}:${attachment.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(attachment);
  }
  return merged;
}
