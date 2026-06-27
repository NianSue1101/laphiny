import type { ChatMessage, Room } from '../types';

export type RoomReplyNotification = {
  id: string;
  roomId: string;
  roomName: string;
  authorName: string;
  preview: string;
  createdAt: string;
};

export function buildRoomReplyNotification({
  roomId,
  message,
  rooms,
  activeRoomId,
  activeTab,
}: {
  roomId: string;
  message: ChatMessage;
  rooms: Room[];
  activeRoomId: string | null;
  activeTab: string;
}): RoomReplyNotification | null {
  if (message.authorId === 'user' || message.authorId === 'system' || message.status === 'running') return null;
  if (activeRoomId === roomId && activeTab === 'chat') return null;

  const room = rooms.find((item) => item.id === roomId);
  if (!room) return null;

  const compactContent = message.content.trim().replace(/\s+/g, ' ');
  const attachmentHint = message.attachments?.length ? ` · ${message.attachments.length} 个附件` : '';
  const rawPreview = `${compactContent || '新的回复'}${attachmentHint}`;
  const preview = rawPreview.length > 92
    ? attachmentHint
      ? `${(compactContent || '新的回复').slice(0, Math.max(12, 89 - attachmentHint.length))}...${attachmentHint}`
      : `${rawPreview.slice(0, 92)}...`
    : rawPreview;

  return {
    id: `${roomId}:${message.id}`,
    roomId,
    roomName: room.name,
    authorName: message.authorName,
    preview,
    createdAt: message.createdAt,
  };
}
