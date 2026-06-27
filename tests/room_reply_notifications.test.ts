import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRoomReplyNotification } from '../src/lib/room_reply_notifications';
import type { ChatMessage, Room } from '../src/types';

const now = '2026-06-27T08:00:00.000Z';

function makeRoom(id: string, name: string): Room {
  return {
    id,
    name,
    kind: 'direct',
    members: [{ connectionId: 'conn_1', alias: 'Flor', enabled: true }],
    sessionIds: { conn_1: `session-${id}` },
    sessionKey: `session-${id}`,
    createdAt: now,
    updatedAt: now,
  };
}

function makeAgentMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    roomId: 'room_b',
    role: 'assistant',
    authorId: 'conn_1',
    authorName: 'Flor',
    content: '后台房间的新回复',
    status: 'sent',
    createdAt: now,
    ...overrides,
  };
}

test('builds a room reply notification for agent messages outside the active room', () => {
  const notification = buildRoomReplyNotification({
    roomId: 'room_b',
    message: makeAgentMessage(),
    rooms: [makeRoom('room_a', '主房间'), makeRoom('room_b', '后台房间')],
    activeRoomId: 'room_a',
    activeTab: 'chat',
  });

  assert.equal(notification?.roomId, 'room_b');
  assert.equal(notification?.roomName, '后台房间');
  assert.equal(notification?.authorName, 'Flor');
  assert.equal(notification?.preview, '后台房间的新回复');
});

test('does not notify for the active chat room, user messages, system messages, or running placeholders', () => {
  const rooms = [makeRoom('room_b', '后台房间')];
  assert.equal(buildRoomReplyNotification({ roomId: 'room_b', message: makeAgentMessage(), rooms, activeRoomId: 'room_b', activeTab: 'chat' }), null);
  assert.equal(buildRoomReplyNotification({ roomId: 'room_b', message: makeAgentMessage({ authorId: 'user' }), rooms, activeRoomId: 'room_a', activeTab: 'chat' }), null);
  assert.equal(buildRoomReplyNotification({ roomId: 'room_b', message: makeAgentMessage({ authorId: 'system' }), rooms, activeRoomId: 'room_a', activeTab: 'chat' }), null);
  assert.equal(buildRoomReplyNotification({ roomId: 'room_b', message: makeAgentMessage({ status: 'running' }), rooms, activeRoomId: 'room_a', activeTab: 'chat' }), null);
});

test('compacts long previews and includes attachment count', () => {
  const notification = buildRoomReplyNotification({
    roomId: 'room_b',
    message: makeAgentMessage({
      content: '这是一段很长的回复 '.repeat(12),
      attachments: [{ id: 'att_1', name: 'note.txt', mimeType: 'text/plain', kind: 'text' }],
    }),
    rooms: [makeRoom('room_b', '后台房间')],
    activeRoomId: 'room_a',
    activeTab: 'rooms',
  });

  assert.ok(notification);
  assert.ok(notification.preview.length <= 95);
  assert.match(notification.preview, /\.\.\. · 1 个附件$/);
});
