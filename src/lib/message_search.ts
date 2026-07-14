import type { ChatMessage } from '../types';

export type MessageSearchDocument = {
  messageId: string;
  roomId: string;
  createdAt: string;
  normalizedText: string;
};

export function normalizeMessageSearchQuery(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, ' ');
}

export function buildMessageSearchDocuments(roomId: string, messages: ChatMessage[]): MessageSearchDocument[] {
  return messages.map((message) => ({
    messageId: message.id,
    roomId,
    createdAt: message.createdAt,
    normalizedText: normalizeMessageSearchQuery([
      message.authorName,
      message.content,
      message.reasoning ?? '',
      ...(message.attachments?.map((attachment) => attachment.name) ?? []),
    ].join('\n')),
  }));
}

export function findMessageSearchDocumentIds(
  documents: MessageSearchDocument[],
  rawQuery: string,
  limit = 50,
): string[] {
  const query = normalizeMessageSearchQuery(rawQuery);
  if (!query || limit <= 0) return [];
  return documents
    .filter((document) => document.normalizedText.includes(query))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)
    .map((document) => document.messageId);
}

export function shouldAutoLoadOlderMessages({
  offsetY,
  hasOlderMessages,
  loading,
  searching,
}: {
  offsetY: number;
  hasOlderMessages: boolean;
  loading: boolean;
  searching: boolean;
}): boolean {
  return offsetY <= 72 && hasOlderMessages && !loading && !searching;
}
