import assert from 'node:assert/strict';
import test from 'node:test';

import { getInterruptedRecoveryKind, shouldRecoverInterruptedMessage } from '../src/lib/stream_recovery';
import type { ChatMessage } from '../src/types';

function makeInterrupted(patch: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg_1',
    roomId: 'room_1',
    role: 'assistant',
    authorId: 'conn_1',
    authorName: 'Agent',
    content: '部分正文',
    status: 'interrupted',
    createdAt: '2026-07-18T00:00:00.000Z',
    ...patch,
  };
}

test('reattaches durable runs without creating a second Agent turn', () => {
  const message = makeInterrupted({ hermesTransport: 'runs', hermesRunId: 'run_1' });
  assert.equal(getInterruptedRecoveryKind(message), 'reattach');
  assert.equal(shouldRecoverInterruptedMessage(message, {}), true);
  assert.equal(shouldRecoverInterruptedMessage(message, { msg_1: true }), false);
});

test('only auto-continues a classic stream once and without side-effect signals', () => {
  assert.equal(getInterruptedRecoveryKind(makeInterrupted()), 'continue');
  assert.equal(getInterruptedRecoveryKind(makeInterrupted({ recoveryAttempts: 1 })), 'manual');
  assert.equal(getInterruptedRecoveryKind(makeInterrupted({
    activityNotices: [{ id: 'tool_1', kind: 'tool', label: 'terminal', status: 'completed', createdAt: '2026-07-18T00:00:00.000Z' }],
  })), 'manual');
  assert.equal(getInterruptedRecoveryKind(makeInterrupted({ permissionRequest: {
    id: 'permission_1', key: 'terminal', title: '确认', body: '执行命令', status: 'pending', createdAt: '2026-07-18T00:00:00.000Z',
  } })), 'manual');
});

test('bounds durable recovery attempts', () => {
  const exhausted = makeInterrupted({
    hermesTransport: 'runs',
    hermesRunId: 'run_1',
    recoveryAttempts: 20,
  });
  assert.equal(shouldRecoverInterruptedMessage(exhausted, {}), false);
});

