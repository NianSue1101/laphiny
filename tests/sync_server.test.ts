import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createApp, mergeSnapshot, openDatabase, readSnapshot } from '../scripts/sync-server.mjs';

const now = '2026-06-26T00:00:00.000Z';

test('sync server merges snapshots into sqlite tables', () => {
  const db = openDatabase(':memory:');
  mergeSnapshot(db, makeSnapshot());

  const snapshot = readSnapshot(db);
  assert.equal(snapshot.connections.length, 1);
  assert.equal(snapshot.rooms.length, 1);
  assert.equal(snapshot.rooms[0].members[0].alias, 'Flor');
  assert.equal(snapshot.messagesByRoom.room_1.length, 1);
  assert.equal(snapshot.messagesByRoom.room_1[0].attachments?.[0].name, 'note.txt');
  assert.equal(snapshot.squareEvents.length, 1);

  db.close();
});

test('sync server keeps newer connection records during merge', () => {
  const db = openDatabase(':memory:');
  mergeSnapshot(db, makeSnapshot({ connectionName: 'Old', updatedAt: '2026-06-26T00:00:00.000Z' }));
  mergeSnapshot(db, makeSnapshot({ connectionName: 'New', updatedAt: '2026-06-26T00:01:00.000Z' }));
  mergeSnapshot(db, makeSnapshot({ connectionName: 'Older again', updatedAt: '2026-06-25T23:59:00.000Z' }));

  const snapshot = readSnapshot(db);
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
      createdAt: now,
      updatedAt,
    }],
    rooms: [{
      id: 'room_1',
      name: 'Room',
      kind: 'direct',
      members: [{ connectionId: 'conn_1', alias: 'Flor', enabled: true }],
      sessionIds: {},
      sessionKey: 'session',
      contextLimit: 20,
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
        status: 'sent',
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
