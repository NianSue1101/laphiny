import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveChatRetryRequest } from '../src/lib/chat_retry';
import type { ChatMessage, Room } from '../src/types';

const room: Room = {
  id: 'room',
  name: 'Room',
  kind: 'group',
  members: [
    { connectionId: 'agent-a', alias: 'A', enabled: true },
    { connectionId: 'agent-b', alias: 'B', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'room',
  createdAt: '2026-07-15T00:00:00.000Z',
  updatedAt: '2026-07-15T00:00:00.000Z',
};

function message(patch: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'message',
    roomId: 'room',
    role: 'assistant',
    authorId: 'agent-a',
    authorName: 'A',
    content: '',
    status: 'stopped',
    createdAt: '2026-07-15T00:00:00.000Z',
    ...patch,
  };
}

test('retries an interrupted reply only on its original Agent and links the attempt', () => {
  const user = message({ id: 'user-1', role: 'user', authorId: 'user', authorName: '你', content: '完成目标', status: 'sent' });
  const stopped = message({ id: 'agent-1', content: '半条回复', status: 'stopped' });
  const resolution = resolveChatRetryRequest(room, [user, stopped], stopped);

  assert.equal(resolution.ok, true);
  if (resolution.ok) {
    assert.equal(resolution.request.text, '完成目标');
    assert.deepEqual(resolution.request.targetConnectionIds, ['agent-a']);
    assert.equal(resolution.request.retryOfMessageId, 'agent-1');
  }
});
