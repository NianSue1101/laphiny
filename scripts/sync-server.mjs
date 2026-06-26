import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const DEFAULT_PORT = 8787;

export function openDatabase(path = process.env.LAPHINY_SYNC_DB || 'laphiny-sync.sqlite') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      session_key TEXT NOT NULL,
      context_limit INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS room_members (
      room_id TEXT NOT NULL,
      connection_id TEXT NOT NULL,
      alias TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      PRIMARY KEY (room_id, connection_id),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      role TEXT NOT NULL,
      author_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER,
      uri TEXT,
      data_url TEXT,
      text TEXT,
      kind TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS square_events (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      source TEXT NOT NULL,
      target TEXT,
      room_id TEXT,
      room_name TEXT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export function createApp({ db, apiKey = process.env.LAPHINY_SYNC_API_KEY || '' }) {
  return async function app(request, response) {
    setCors(response);
    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    try {
      if (!isAuthorized(request, apiKey)) {
        sendJson(response, 401, { error: 'Unauthorized' });
        return;
      }

      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname;

      if (request.method === 'GET' && path === '/v1/health') {
        sendJson(response, 200, { status: 'ok', updatedAt: latestUpdatedAt(db) });
        return;
      }

      if (request.method === 'GET' && path === '/v1/snapshot') {
        sendJson(response, 200, readSnapshot(db));
        return;
      }

      if (request.method === 'PUT' && path === '/v1/snapshot') {
        const snapshot = await readJson(request);
        mergeSnapshot(db, snapshot);
        sendJson(response, 200, readSnapshot(db));
        return;
      }

      if (request.method === 'GET' && path === '/v1/events') {
        sendJson(response, 200, readEvents(db, url.searchParams.get('since') ?? undefined));
        return;
      }

      if (request.method === 'POST' && path === '/v1/events') {
        const event = await readJson(request);
        upsertSquareEvent(db, event);
        sendJson(response, 200, event);
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function startServer(options = {}) {
  const db = options.db ?? openDatabase(options.dbPath);
  const app = createApp({ db, apiKey: options.apiKey });
  const server = createServer(app);
  const port = Number(options.port ?? process.env.LAPHINY_SYNC_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.LAPHINY_SYNC_HOST ?? '0.0.0.0';
  server.listen(port, host, () => {
    console.log(`Laphiny sync server listening on http://${host}:${port}`);
  });
  return { server, db };
}

export function mergeSnapshot(db, snapshot) {
  db.exec('BEGIN');
  try {
    for (const connection of snapshot.connections ?? []) upsertConnection(db, connection);
    for (const room of snapshot.rooms ?? []) upsertRoom(db, room);
    for (const [roomId, messages] of Object.entries(snapshot.messagesByRoom ?? {})) {
      for (const message of messages) upsertMessage(db, { ...message, roomId: message.roomId ?? roomId });
    }
    for (const event of snapshot.squareEvents ?? []) upsertSquareEvent(db, event);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function readSnapshot(db) {
  return {
    connections: readConnections(db),
    rooms: readRooms(db),
    messagesByRoom: readMessagesByRoom(db),
    squareEvents: readEvents(db),
    updatedAt: latestUpdatedAt(db),
  };
}

function upsertConnection(db, connection) {
  const existing = db.prepare('SELECT updated_at FROM connections WHERE id = ?').get(connection.id);
  if (existing && compareIso(existing.updated_at, connection.updatedAt) > 0) return;
  db.prepare(`
    INSERT INTO connections (id, name, base_url, api_key, model, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      model = excluded.model,
      enabled = excluded.enabled,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    connection.id,
    connection.name,
    connection.baseUrl,
    connection.apiKey ?? '',
    connection.model,
    connection.enabled ? 1 : 0,
    connection.createdAt,
    connection.updatedAt,
  );
}

function upsertRoom(db, room) {
  const existing = db.prepare('SELECT updated_at FROM rooms WHERE id = ?').get(room.id);
  if (existing && compareIso(existing.updated_at, room.updatedAt) > 0) return;
  db.prepare(`
    INSERT INTO rooms (id, name, kind, session_key, context_limit, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      session_key = excluded.session_key,
      context_limit = excluded.context_limit,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    room.id,
    room.name,
    room.kind,
    room.sessionKey,
    room.contextLimit ?? null,
    room.createdAt,
    room.updatedAt,
  );
  db.prepare('DELETE FROM room_members WHERE room_id = ?').run(room.id);
  for (const member of room.members ?? []) {
    db.prepare(`
      INSERT INTO room_members (room_id, connection_id, alias, enabled)
      VALUES (?, ?, ?, ?)
    `).run(room.id, member.connectionId, member.alias, member.enabled ? 1 : 0);
  }
}

function upsertMessage(db, message) {
  db.prepare(`
    INSERT INTO messages (id, room_id, role, author_id, author_name, content, status, error, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      room_id = excluded.room_id,
      role = excluded.role,
      author_id = excluded.author_id,
      author_name = excluded.author_name,
      content = excluded.content,
      status = excluded.status,
      error = excluded.error,
      created_at = excluded.created_at
  `).run(
    message.id,
    message.roomId,
    message.role,
    message.authorId,
    message.authorName,
    message.content,
    message.status,
    message.error ?? null,
    message.createdAt,
  );
  db.prepare('DELETE FROM attachments WHERE message_id = ?').run(message.id);
  for (const attachment of message.attachments ?? []) {
    db.prepare(`
      INSERT INTO attachments (id, message_id, name, mime_type, size, uri, data_url, text, kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      attachment.id,
      message.id,
      attachment.name,
      attachment.mimeType,
      attachment.size ?? null,
      attachment.uri ?? null,
      attachment.dataUrl ?? null,
      attachment.text ?? null,
      attachment.kind,
    );
  }
}

function upsertSquareEvent(db, event) {
  db.prepare(`
    INSERT INTO square_events (id, kind, source, target, room_id, room_name, title, body, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      source = excluded.source,
      target = excluded.target,
      room_id = excluded.room_id,
      room_name = excluded.room_name,
      title = excluded.title,
      body = excluded.body,
      created_at = excluded.created_at
  `).run(
    event.id,
    event.kind,
    event.source,
    event.target ?? null,
    event.roomId ?? null,
    event.roomName ?? null,
    event.title,
    event.body,
    event.createdAt,
  );
}

function readConnections(db) {
  return db.prepare('SELECT * FROM connections ORDER BY updated_at ASC').all().map((row) => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function readRooms(db) {
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY updated_at ASC').all();
  const membersByRoom = new Map();
  for (const member of db.prepare('SELECT * FROM room_members ORDER BY alias ASC').all()) {
    const current = membersByRoom.get(member.room_id) ?? [];
    current.push({
      connectionId: member.connection_id,
      alias: member.alias,
      enabled: Boolean(member.enabled),
    });
    membersByRoom.set(member.room_id, current);
  }
  return rooms.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    members: membersByRoom.get(row.id) ?? [],
    sessionIds: {},
    sessionKey: row.session_key,
    contextLimit: row.context_limit ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function readMessagesByRoom(db) {
  const messagesByRoom = {};
  const attachmentsByMessage = new Map();
  for (const attachment of db.prepare('SELECT * FROM attachments ORDER BY name ASC').all()) {
    const current = attachmentsByMessage.get(attachment.message_id) ?? [];
    current.push({
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mime_type,
      size: attachment.size ?? undefined,
      uri: attachment.uri ?? undefined,
      dataUrl: attachment.data_url ?? undefined,
      text: attachment.text ?? undefined,
      kind: attachment.kind,
    });
    attachmentsByMessage.set(attachment.message_id, current);
  }

  for (const row of db.prepare('SELECT * FROM messages ORDER BY created_at ASC').all()) {
    const message = {
      id: row.id,
      roomId: row.room_id,
      role: row.role,
      authorId: row.author_id,
      authorName: row.author_name,
      content: row.content,
      attachments: attachmentsByMessage.get(row.id) ?? undefined,
      status: row.status,
      error: row.error ?? undefined,
      createdAt: row.created_at,
    };
    const current = messagesByRoom[row.room_id] ?? [];
    current.push(message);
    messagesByRoom[row.room_id] = current;
  }
  return messagesByRoom;
}

function readEvents(db, since) {
  const rows = since
    ? db.prepare('SELECT * FROM square_events WHERE created_at > ? ORDER BY created_at ASC').all(since)
    : db.prepare('SELECT * FROM square_events ORDER BY created_at ASC LIMIT 500').all();
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    source: row.source,
    target: row.target ?? undefined,
    roomId: row.room_id ?? undefined,
    roomName: row.room_name ?? undefined,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
  }));
}

function latestUpdatedAt(db) {
  const candidates = [
    db.prepare('SELECT MAX(updated_at) AS value FROM connections').get().value,
    db.prepare('SELECT MAX(updated_at) AS value FROM rooms').get().value,
    db.prepare('SELECT MAX(created_at) AS value FROM messages').get().value,
    db.prepare('SELECT MAX(created_at) AS value FROM square_events').get().value,
  ].filter(Boolean);
  return candidates.sort().at(-1) ?? new Date().toISOString();
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function setCors(response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,PUT,OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type,authorization');
}

function isAuthorized(request, apiKey) {
  if (!apiKey) return true;
  return request.headers.authorization === `Bearer ${apiKey}`;
}

function compareIso(left, right) {
  return Date.parse(left ?? '') - Date.parse(right ?? '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer();
}
