import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp, mergeSnapshot, openDatabase, readSnapshot } from '../scripts/sync-server.mjs';

const now = '2026-06-26T00:00:00.000Z';

test('sync server merges snapshots into sqlite tables', () => {
  const db = openDatabase(':memory:');
  mergeSnapshot(db, makeSnapshot());

  const snapshot: any = readSnapshot(db);
  assert.equal(snapshot.connections.length, 1);
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.rooms[0].members[0].alias, 'Flor');
  assert.equal(snapshot.rooms[0].sessionIds.conn_1, 'session-conn-1');
  assert.equal(snapshot.rooms[0].memberSessionKeys.conn_1, 'member-key-1');
  assert.equal(snapshot.connections[0].profile?.publicPersona, '公开协作卡片');
  assert.equal(snapshot.messagesByRoom.room_1.length, 1);
  assert.equal(snapshot.messagesByRoom.room_1[0].attachments?.[0].name, 'note.txt');
  assert.equal(snapshot.messagesByRoom.room_1[0].hermesRunId, 'run_1');
  assert.equal(snapshot.messagesByRoom.room_1[0].hermesTransport, 'runs');
  assert.equal(snapshot.messagesByRoom.room_1[0].hermesRunStatus, 'reconnecting');
  assert.equal(snapshot.messagesByRoom.room_1[0].recoveryAttempts, 2);
  assert.equal(snapshot.messagesByRoom.room_1[0].status, 'interrupted');
  assert.equal(snapshot.squareEvents.length, 1);
  assert.equal(snapshot.rooms[0].defaultCollaborationMode, 'sequential');
  assert.equal(snapshot.rooms[0].lastSummary?.authorName, 'Flor');
  assert.equal(snapshot.rooms[0].memoryCapsule?.goal, '长期迭代 Laphiny');
  assert.equal(snapshot.rooms[0].roleplay?.gmConnectionId, 'conn_1');
  assert.equal(snapshot.collaborationEvents.length, 1);
  assert.equal(snapshot.delegationTasks.length, 1);
  assert.equal(snapshot.teamTemplates.length, 1);
  assert.equal(snapshot.profileVersions.length, 1);

  db.close();
});

test('sync server keeps newer connection records during merge', () => {
  const db = openDatabase(':memory:');
  mergeSnapshot(db, makeSnapshot({ connectionName: 'Old', updatedAt: '2026-06-26T00:00:00.000Z' }));
  mergeSnapshot(db, makeSnapshot({ connectionName: 'New', updatedAt: '2026-06-26T00:01:00.000Z' }));
  mergeSnapshot(db, makeSnapshot({ connectionName: 'Older again', updatedAt: '2026-06-25T23:59:00.000Z' }));

  const snapshot: any = readSnapshot(db);
  assert.equal(snapshot.connections[0].name, 'New');

  db.close();
});

test('sync server exposes authenticated snapshot and event endpoints', async () => {
  const db = openDatabase(':memory:');
  const server = createServer(createApp({ db, apiKey: 'secret' }));
  await listen(server);
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await fetch(`${baseUrl}/v1/snapshot`);
  assert.equal(unauthorized.status, 401);

  const put = await fetch(`${baseUrl}/v1/snapshot`, {
    method: 'PUT',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify(makeSnapshot()),
  });
  assert.equal(put.status, 200);

  const events = await fetch(`${baseUrl}/v1/events`, {
    headers: { authorization: 'Bearer secret' },
  }).then((response) => response.json());
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'Flor');

  await close(server);
  db.close();
});

test('legacy reference server atomically commits resumable large snapshot transfers', async () => {
  const db = openDatabase(':memory:');
  const server = createServer(createApp({ db, apiKey: 'secret', now: () => now }));
  await listen(server);
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { authorization: 'Bearer secret' };
  const snapshot: any = makeSnapshot();
  snapshot.messagesByRoom.room_1[0].content = 'large/'.repeat(60_000);
  const payload = Buffer.from(JSON.stringify(snapshot));
  const sha256 = createHash('sha256').update(payload).digest('hex');
  const transferId = `snapshot_${sha256}`;
  const parts: Buffer[] = [];
  for (let offset = 0; offset < payload.length; offset += 96_000) parts.push(payload.subarray(offset, offset + 96_000));

  const health: any = await fetch(`${baseUrl}/v1/health`, { headers }).then((response) => response.json());
  assert.equal(health.capabilities.snapshotTransfers.protocol, 'laphiny.snapshot-transfer.v1');
  const initialized = await fetch(`${baseUrl}/v1/snapshot-transfers`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ transferId, sha256, totalBytes: payload.length, totalParts: parts.length, baseRevision: health.syncRevision }),
  });
  assert.equal(initialized.status, 200);
  for (let index = 0; index < parts.length; index += 1) {
    const uploaded = await fetch(`${baseUrl}/v1/snapshot-transfers/${transferId}/parts/${index}`, {
      method: 'PUT', headers: { ...headers, 'content-type': 'application/octet-stream' }, body: parts[index] as unknown as BodyInit,
    });
    assert.equal(uploaded.status, 200);
  }
  assert.equal((readSnapshot(db) as any).connections.length, 0);
  const committed = await fetch(`${baseUrl}/v1/snapshot-transfers/${transferId}/commit`, { method: 'POST', headers });
  const receipt: any = await committed.json();
  assert.equal(committed.status, 200);
  assert.equal(receipt.state, 'committed');
  assert.equal(receipt.committedRevision, 1);
  assert.equal(receipt.messagesByRoom, undefined);
  assert.equal((readSnapshot(db) as any).messagesByRoom.room_1[0].content, snapshot.messagesByRoom.room_1[0].content);
  const repeated: any = await fetch(`${baseUrl}/v1/snapshot-transfers/${transferId}/commit`, { method: 'POST', headers }).then((response) => response.json());
  assert.equal(repeated.committedRevision, 1);

  await close(server);
  db.close();
});

function makeSnapshot(options: { connectionName?: string; updatedAt?: string } = {}) {
  const updatedAt = options.updatedAt ?? now;
  return {
    connections: [{
      id: 'conn_1',
      name: options.connectionName ?? 'Flor',
      baseUrl: 'https://example.test/hermes',
      apiKey: 'key',
      model: 'hermes-agent',
      enabled: true,
      profile: {
        publicPersona: '公开协作卡片',
        strengths: ['测试'],
        delegateWhen: ['需要测试'],
        avoidWhen: [],
        source: 'self-report',
        updatedAt,
      },
      createdAt: now,
      updatedAt,
    }],
    rooms: [{
      id: 'room_1',
      name: 'Room',
      kind: 'direct',
      members: [{ connectionId: 'conn_1', alias: 'Flor', enabled: true }],
      sessionIds: { conn_1: 'session-conn-1' },
      sessionKey: 'session',
      memberSessionKeys: { conn_1: 'member-key-1' },
      contextLimit: 20,
      defaultCollaborationMode: 'sequential',
      summaryConnectionId: 'conn_1',
      autoDelegationEnabled: true,
      maxDelegationDepth: 3,
      lastSummary: {
        id: 'summary_1',
        roomId: 'room_1',
        authorConnectionId: 'conn_1',
        authorName: 'Flor',
        content: 'summary',
        sourceMessageCount: 1,
        createdAt: now,
      },
      memoryCapsule: {
        id: 'memory_1',
        roomId: 'room_1',
        goal: '长期迭代 Laphiny',
        decisions: ['主打 Soul-native 协作'],
        todos: ['实现协作仪式'],
        preferences: ['中文输出'],
        openQuestions: ['如何部署'],
        handoffNotes: '先看阶段四文档',
        source: 'agent-generated',
        authorName: 'Flor',
        version: 1,
        createdAt: now,
        updatedAt,
      },
      roleplay: {
        enabled: true,
        gmConnectionId: 'conn_1',
        playerName: '调查员',
        genre: '都市怪谈',
        tone: '悬疑、温柔、桌游店式',
        premise: '雨夜里的旧书店忽然开门。',
        currentScene: '玩家站在旧书店门口。',
        includeAllAgents: true,
        updatedAt,
      },
      createdAt: now,
      updatedAt,
    }],
    messagesByRoom: {
      room_1: [{
        id: 'msg_1',
        roomId: 'room_1',
        role: 'assistant',
        authorId: 'conn_1',
        authorName: 'Flor',
        content: 'hello',
        attachments: [{
          id: 'att_1',
          name: 'note.txt',
          mimeType: 'text/plain',
          size: 5,
          text: 'hello',
          kind: 'text',
        }],
        hermesRunId: 'run_1',
        hermesTransport: 'runs',
        hermesRunStatus: 'reconnecting',
        recoveryAttempts: 2,
        status: 'interrupted',
        createdAt: now,
      }],
    },
    squareEvents: [{
      id: 'evt_1',
      kind: 'message',
      source: 'Flor',
      roomId: 'room_1',
      roomName: 'Room',
      title: 'Flor 更新',
      body: 'hello',
      createdAt: now,
    }],
    collaborationEvents: [{
      id: 'collab_1',
      kind: 'delegation_created',
      roomId: 'room_1',
      roomName: 'Room',
      source: 'Flor',
      target: 'Laper',
      title: 'Flor 委托 Laper',
      body: '任务',
      createdAt: now,
    }],
    delegationTasks: [{
      id: 'task_1',
      roomId: 'room_1',
      roomName: 'Room',
      fromConnectionId: 'conn_1',
      fromAlias: 'Flor',
      toConnectionId: 'conn_2',
      toAlias: 'Laper',
      taskText: '任务',
      status: 'done',
      depth: 1,
      createdAt: now,
      updatedAt,
    }],
    teamTemplates: [{
      id: 'team_1',
      name: '默认小队',
      memberOrder: ['conn_1'],
      defaultMode: 'sequential',
      autoDelegationEnabled: true,
      maxDelegationDepth: 3,
      createdAt: now,
      updatedAt,
    }],
    profileVersions: [{
      id: 'profile_1',
      connectionId: 'conn_1',
      connectionName: 'Flor',
      profile: {
        publicPersona: '公开协作卡片',
        strengths: ['测试'],
        delegateWhen: ['需要测试'],
        avoidWhen: [],
      },
      createdAt: now,
    }],
    updatedAt,
  };
}

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
