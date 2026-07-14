import type { Attachment, ChatMessage, Room } from '../types';

export type ChatRetryRequest = {
  text: string;
  attachments: Attachment[];
  targetConnectionIds: string[];
  retryOfMessageId: string;
};

export type ChatRetryResolution =
  | { ok: true; request: ChatRetryRequest }
  | { ok: false; error: string };

export function resolveChatRetryRequest(room: Room, messages: ChatMessage[], message: ChatMessage): ChatRetryResolution {
  if (message.authorId === 'user' || message.authorId === 'system') return { ok: false, error: '只能重试 Agent 回复。' };
  const member = room.members.find((item) => item.enabled && item.connectionId === message.authorId);
  if (!member) return { ok: false, error: '这个 Agent 已不在当前房间或已被停用。' };
  const messageIndex = messages.findIndex((item) => item.id === message.id);
  if (messageIndex < 0) return { ok: false, error: '没有找到需要重试的回复。' };
  let userMessage: ChatMessage | undefined;
  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.authorId === 'user') {
      userMessage = messages[index];
      break;
    }
  }
  if (!userMessage) return { ok: false, error: '没有找到这条回复对应的用户消息。' };
  return {
    ok: true,
    request: {
      text: userMessage.content.replace(/^\[附件\]$/u, ''),
      attachments: userMessage.attachments ?? [],
      targetConnectionIds: [member.connectionId],
      retryOfMessageId: message.id,
    },
  };
}
