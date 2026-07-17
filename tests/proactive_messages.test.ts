import assert from 'node:assert/strict';
import test from 'node:test';

import { ingestProactiveAgentMessages, mergeProactiveMessages } from '../src/lib/proactive_messages';
import type { ChatMessage, ProactiveAgentMessageEvent, Room } from '../src/types';

const now = '2026-07-17T03:00:00.000Z';
const room: Room = {
  id: 'room_1',
  name: '主动回复测试',
  kind: 'direct',
  members: [{ connectionId: 'conn_1', alias: 'Flor', enabled: true }],
  sessionIds: {},
  sessionKey: 'session',
  createdAt: now,
  updatedAt: now,
};

test('ingests a room-scoped proactive Agent message and stamps its origin', () => {
  const result = ingestProactiveAgentMessages({
    events: [makeEvent(1)],
    rooms: [room],
    messagesByRoom: {},
    receivedAt: now,
  });

  assert.equal(result.rejected.length, 0);
  assert.equal(result.lastSequence, 1);
  assert.equal(result.acceptedByRoom.room_1![0]!.origin, 'proactive');
  assert.equal(result.acceptedByRoom.room_1![0]!.inboundEventId, 'event_1');
});

test('deduplicates replayed events and rejects mismatched room identity', () => {
  const existing: ChatMessage = {
    ...makeEvent(1).message,
    inboundEventId: 'event_1',
  };
  const forged = makeEvent(2);
  forged.message.authorId = 'conn_other';
  const result = ingestProactiveAgentMessages({
    events: [makeEvent(1), forged],
    rooms: [room],
    messagesByRoom: { room_1: [existing] },
    receivedAt: now,
  });

  assert.deepEqual(result.acceptedByRoom, {});
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0]!.reason, /寻址不一致/u);
  assert.equal(result.lastSequence, 2);
});

test('merges accepted proactive messages without replacing local history', () => {
  const local = { ...makeEvent(1).message, id: 'local_1' };
  const incoming = makeEvent(2).message;
  const merged = mergeProactiveMessages({ room_1: [local] }, { room_1: [incoming] });
  assert.deepEqual(merged.room_1!.map((message) => message.id), ['local_1', 'message_2']);
});

function makeEvent(sequence: number): ProactiveAgentMessageEvent {
  return {
    protocol: 'laphiny.proactive-message.v1',
    sequence,
    eventId: `event_${sequence}`,
    roomId: 'room_1',
    connectionId: 'conn_1',
    authorName: 'Flor',
    idempotencyKey: `timer:${sequence}`,
    message: {
      id: `message_${sequence}`,
      roomId: 'room_1',
      role: 'assistant',
      authorId: 'conn_1',
      authorName: 'Flor',
      content: '定时任务完成',
      status: 'sent',
      origin: 'proactive',
      inboundEventId: `event_${sequence}`,
      createdAt: now,
    },
    createdAt: now,
  };
}
