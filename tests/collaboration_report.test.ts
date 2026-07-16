import assert from 'node:assert/strict';
import { test } from 'node:test';

import { assertCollaborationReportSafe, buildCollaborationRunReport } from '../src/lib/collaboration_report';
import type { CollaborationEvent, DelegationTask, Room } from '../src/types';

const now = '2026-07-16T00:00:00.000Z';
const room = { id: 'private-room', kind: 'group', members: [], sessionIds: {}, sessionKey: 'secret', createdAt: now, updatedAt: now } as unknown as Room;
const task = {
  id: 'private-task', roomId: room.id, roomName: 'Secret room', fromConnectionId: 'conn-a', fromAlias: 'Alice',
  toConnectionId: 'conn-b', toAlias: 'Bob', taskText: 'private prompt', status: 'error', depth: 1,
  evidence: ['API_KEY=0123456789abcdef0123456789abcdef https://private.invalid user@example.com C:\\secret\\file'],
  attemptHistory: [{ id: 'a', operationId: 'op', number: 1, kind: 'initial', toConnectionId: 'conn-b', toAlias: 'Bob', status: 'error', error: 'token=very-secret', createdAt: now }],
  createdAt: now, updatedAt: now,
} as DelegationTask;
const event = { id: 'event', kind: 'delegation_created', roomId: room.id, roomName: 'Secret', title: 'private', body: 'hidden reasoning', createdAt: now } as CollaborationEvent;

test('collaboration report uses an allowlist and removes private connection and text data', () => {
  const report = buildCollaborationRunReport({ room, tasks: [task], events: [event], appVersion: '0.33.0', generatedAt: now });
  const text = JSON.stringify(report);
  for (const secret of ['private-room', 'private-task', 'conn-a', 'conn-b', 'Alice', 'Bob', 'private prompt', 'hidden reasoning', 'private.invalid', 'user@example.com', '0123456789abcdef']) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.match(text, /laphiny\.collaboration-report\.v1/u);
  assert.match(text, /Agent 1/u);
});
test('report safety audit rejects forbidden keys and raw secret canaries', () => {
  assert.throws(() => assertCollaborationReportSafe({ reasoning: 'hidden' }));
  assert.throws(() => assertCollaborationReportSafe({ evidence: 'https://private.invalid' }));
});
