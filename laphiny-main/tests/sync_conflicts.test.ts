import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSyncConflictReport } from '../src/lib/sync_conflicts';
import type { SyncSnapshot } from '../src/types';

function snapshot(partial: Partial<SyncSnapshot>): SyncSnapshot {
  return {
    connections: [],
    rooms: [],
    messagesByRoom: {},
    squareEvents: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

test('reports local and remote only sync differences', () => {
  const local = snapshot({
    connections: [{
      id: 'a',
      name: 'A',
      baseUrl: 'https://a.test',
      apiKey: 'secret',
      model: 'm',
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
    }],
  });
  const remote = snapshot({
    connections: [{
      id: 'b',
      name: 'B',
      baseUrl: 'https://b.test',
      apiKey: 'secret',
      model: 'm',
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-03T00:00:00.000Z',
    }],
  });

  const report = buildSyncConflictReport(local, remote, '2026-01-04T00:00:00.000Z');
  assert.equal(report.summary.localOnly, 1);
  assert.equal(report.summary.remoteOnly, 1);
  assert.equal(report.summary.total, 2);
});

test('reports newer updated entities', () => {
  const baseConnection = {
    id: 'a',
    name: 'A',
    baseUrl: 'https://a.test',
    apiKey: 'secret',
    model: 'm',
    enabled: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const local = snapshot({ connections: [{ ...baseConnection, model: 'm1', updatedAt: '2026-01-03T00:00:00.000Z' }] });
  const remote = snapshot({ connections: [{ ...baseConnection, model: 'm2', updatedAt: '2026-01-02T00:00:00.000Z' }] });

  const report = buildSyncConflictReport(local, remote);
  assert.equal(report.summary.localNewer, 1);
  assert.equal(report.items[0]?.status, 'local-newer');
});

test('reports message id conflicts and ignores identical messages', () => {
  const message = {
    id: 'msg1',
    roomId: 'room1',
    role: 'assistant' as const,
    authorId: 'agent1',
    authorName: 'Agent',
    content: 'hello',
    status: 'sent' as const,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const local = snapshot({ messagesByRoom: { room1: [message, { ...message, id: 'msg2', content: 'local' }] } });
  const remote = snapshot({ messagesByRoom: { room1: [message, { ...message, id: 'msg2', content: 'remote' }] } });

  const report = buildSyncConflictReport(local, remote);
  assert.equal(report.summary.total, 1);
  assert.equal(report.items[0]?.entity, 'message');
  assert.equal(report.items[0]?.status, 'same-time-different');
});
