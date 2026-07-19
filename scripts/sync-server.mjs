import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const DEFAULT_PORT = 8787;
const MAX_JSON_BYTES = 256 * 1024;
const SNAPSHOT_TRANSFER_PROTOCOL = 'laphiny.snapshot-transfer.v1';
const MAX_TRANSFER_PART_BYTES = 128 * 1024;
const MAX_TRANSFER_BYTES = 128 * 1024 * 1024;
const MAX_TRANSFER_PARTS = 4096;
const MAX_ACTIVE_TRANSFER_BYTES = 256 * 1024 * 1024;
const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;
const TRANSFER_RECEIPT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function openDatabase(path = process.env.LAPHINY_SYNC_DB || 'laphiny-sync.sqlite') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  cleanupSnapshotTransfers(db);
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
      profile_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      session_key TEXT NOT NULL,
      session_ids TEXT NOT NULL DEFAULT '{}',
      member_session_keys TEXT NOT NULL DEFAULT '{}',
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

    CREATE TABLE IF NOT EXISTS extra_state (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshot_transfers (
      id TEXT PRIMARY KEY, digest TEXT NOT NULL, total_bytes INTEGER NOT NULL,
      total_parts INTEGER NOT NULL, base_revision INTEGER NOT NULL, state TEXT NOT NULL,
      received_bytes INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, expires_at TEXT NOT NULL, committed_revision INTEGER
    );
    CREATE TABLE IF NOT EXISTS snapshot_transfer_parts (
      transfer_id TEXT NOT NULL, part_index INTEGER NOT NULL, size INTEGER NOT NULL,
      digest TEXT NOT NULL, payload BLOB NOT NULL, PRIMARY KEY (transfer_id, part_index),
      FOREIGN KEY(transfer_id) REFERENCES snapshot_transfers(id) ON DELETE CASCADE
    );
  `);
  db.prepare("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('revision', 0)").run();

  ensureColumn(db, 'connections', 'profile_json', 'TEXT');
  ensureColumn(db, 'rooms', 'session_ids', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'rooms', 'member_session_keys', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn(db, 'rooms', 'room_mode', 'TEXT');
  ensureColumn(db, 'rooms', 'default_mode', 'TEXT');
  ensureColumn(db, 'rooms', 'summary_connection_id', 'TEXT');
  ensureColumn(db, 'rooms', 'auto_delegation_enabled', 'INTEGER');
  ensureColumn(db, 'rooms', 'max_delegation_depth', 'INTEGER');
  ensureColumn(db, 'rooms', 'last_summary_json', 'TEXT');
  ensureColumn(db, 'rooms', 'memory_capsule_json', 'TEXT');
  ensureColumn(db, 'rooms', 'roleplay_json', 'TEXT');
  ensureColumn(db, 'messages', 'hermes_run_id', 'TEXT');
  ensureColumn(db, 'messages', 'hermes_transport', 'TEXT');
  ensureColumn(db, 'messages', 'hermes_run_status', 'TEXT');
  ensureColumn(db, 'messages', 'recovery_attempts', 'INTEGER');
}


function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

export function createApp({ db, apiKey = process.env.LAPHINY_SYNC_API_KEY || '', now = () => new Date().toISOString() }) {
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
        sendJson(response, 200, {
          status: 'ok',
          updatedAt: latestUpdatedAt(db),
          syncRevision: readSyncRevision(db),
          capabilities: {
            snapshotTransfers: {
              protocol: SNAPSHOT_TRANSFER_PROTOCOL,
              maxPartBytes: MAX_TRANSFER_PART_BYTES,
              maxTransferBytes: MAX_TRANSFER_BYTES,
              maxParts: MAX_TRANSFER_PARTS,
              ttlMs: TRANSFER_TTL_MS,
            },
          },
        });
        return;
      }

      if (request.method === 'POST' && path === '/v1/snapshot-transfers') {
        cleanupSnapshotTransfers(db, now());
        sendJson(response, 200, initializeSnapshotTransfer(db, await readJson(request), now()));
        return;
      }

      const statusMatch = path.match(/^\/v1\/snapshot-transfers\/([^/]+)$/u);
      if (request.method === 'GET' && statusMatch) {
        cleanupSnapshotTransfers(db, now());
        sendJson(response, 200, readSnapshotTransferStatus(db, decodeURIComponent(statusMatch[1]), now()));
        return;
      }

      const partMatch = path.match(/^\/v1\/snapshot-transfers\/([^/]+)\/parts\/(\d+)$/u);
      if (request.method === 'PUT' && partMatch) {
        cleanupSnapshotTransfers(db, now());
        const payload = await readBody(request, MAX_TRANSFER_PART_BYTES);
        sendJson(response, 200, storeSnapshotTransferPart(db, decodeURIComponent(partMatch[1]), Number(partMatch[2]), payload, now()));
        return;
      }

      const commitMatch = path.match(/^\/v1\/snapshot-transfers\/([^/]+)\/commit$/u);
      if (request.method === 'POST' && commitMatch) {
        cleanupSnapshotTransfers(db, now());
        sendJson(response, 200, commitSnapshotTransfer(db, decodeURIComponent(commitMatch[1]), now()));
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
      sendJson(response, error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.code : 'internal_error',
        message: error instanceof Error ? error.message : String(error),
      });
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
  db.exec('BEGIN IMMEDIATE');
  try {
    mergeSnapshotInTransaction(db, snapshot);
    bumpSyncRevision(db);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function mergeSnapshotInTransaction(db, snapshot) {
  for (const connection of snapshot.connections ?? []) upsertConnection(db, connection);
  for (const room of snapshot.rooms ?? []) upsertRoom(db, room);
  for (const [roomId, messages] of Object.entries(snapshot.messagesByRoom ?? {})) {
    for (const message of messages) upsertMessage(db, { ...message, roomId: message.roomId ?? roomId });
  }
  for (const event of snapshot.squareEvents ?? []) upsertSquareEvent(db, event);
  upsertExtraState(db, 'collaborationEvents', snapshot.collaborationEvents ?? []);
  upsertExtraState(db, 'delegationTasks', snapshot.delegationTasks ?? []);
  upsertExtraState(db, 'teamTemplates', snapshot.teamTemplates ?? []);
  upsertExtraState(db, 'profileVersions', snapshot.profileVersions ?? []);
}

function readSyncRevision(db) {
  return Number(db.prepare("SELECT value FROM sync_meta WHERE key = 'revision'").get()?.value ?? 0);
}

function bumpSyncRevision(db) {
  db.prepare("UPDATE sync_meta SET value = value + 1 WHERE key = 'revision'").run();
  return readSyncRevision(db);
}

function initializeSnapshotTransfer(db, input, timestamp) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400, 'invalid_payload', 'Snapshot transfer must be an object');
  if (input.protocol != null && input.protocol !== SNAPSHOT_TRANSFER_PROTOCOL) throw new HttpError(400, 'unsupported_protocol', `Expected ${SNAPSHOT_TRANSFER_PROTOCOL}`);
  const id = requireTransferId(input.transferId);
  const digest = requireSha256(input.sha256);
  const totalBytes = requirePositiveInteger(input.totalBytes, 'totalBytes');
  const totalParts = requirePositiveInteger(input.totalParts, 'totalParts');
  const baseRevision = requireNonNegativeInteger(input.baseRevision, 'baseRevision');
  if (totalBytes > MAX_TRANSFER_BYTES) throw new HttpError(413, 'transfer_too_large', `Snapshot transfer exceeds ${MAX_TRANSFER_BYTES} bytes`);
  if (totalParts > MAX_TRANSFER_PARTS) throw new HttpError(413, 'too_many_parts', `Snapshot transfer exceeds ${MAX_TRANSFER_PARTS} parts`);
  const existing = db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id);
  if (existing) {
    if (existing.digest !== digest || Number(existing.total_bytes) !== totalBytes || Number(existing.total_parts) !== totalParts || (existing.state !== 'committed' && Number(existing.base_revision) !== baseRevision)) {
      throw new HttpError(409, 'transfer_conflict', 'transferId is already used by a different snapshot');
    }
    return mapSnapshotTransferStatus(db, existing);
  }
  const activeBytes = Number(db.prepare("SELECT COALESCE(SUM(total_bytes), 0) AS value FROM snapshot_transfers WHERE state = 'uploading'").get().value);
  if (activeBytes + totalBytes > MAX_ACTIVE_TRANSFER_BYTES) throw new HttpError(507, 'active_transfer_limit', 'Active snapshot transfers exceed the server storage limit');
  const expiresAt = new Date(Date.parse(timestamp) + TRANSFER_TTL_MS).toISOString();
  db.prepare(`INSERT INTO snapshot_transfers
    (id,digest,total_bytes,total_parts,base_revision,state,received_bytes,created_at,updated_at,expires_at,committed_revision)
    VALUES (?,?,?,?,?,'uploading',0,?,?,?,NULL)`)
    .run(id, digest, totalBytes, totalParts, baseRevision, timestamp, timestamp, expiresAt);
  return mapSnapshotTransferStatus(db, db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id));
}

function readSnapshotTransferStatus(db, rawId, timestamp) {
  const id = requireTransferId(rawId);
  const row = db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'transfer_not_found', 'Snapshot transfer was not found or has expired');
  if (row.state === 'uploading' && Date.parse(row.expires_at) <= Date.parse(timestamp)) throw new HttpError(410, 'transfer_expired', 'Snapshot transfer has expired');
  return mapSnapshotTransferStatus(db, row);
}

function storeSnapshotTransferPart(db, rawId, partIndex, payload, timestamp) {
  const id = requireTransferId(rawId);
  const row = db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'transfer_not_found', 'Snapshot transfer was not found or has expired');
  if (row.state !== 'uploading') return mapSnapshotTransferStatus(db, row);
  if (!Number.isSafeInteger(partIndex) || partIndex < 0 || partIndex >= Number(row.total_parts)) throw new HttpError(400, 'invalid_part', 'Part index is outside the transfer manifest');
  if (payload.length === 0) throw new HttpError(400, 'empty_part', 'Snapshot transfer parts must not be empty');
  const digest = createHash('sha256').update(payload).digest('hex');
  const existing = db.prepare('SELECT size,digest,payload FROM snapshot_transfer_parts WHERE transfer_id = ? AND part_index = ?').get(id, partIndex);
  if (existing) {
    if (existing.digest !== digest || Number(existing.size) !== payload.length || !Buffer.from(existing.payload).equals(payload)) throw new HttpError(409, 'part_conflict', 'This part index already contains different data');
    return mapSnapshotTransferStatus(db, row);
  }
  if (Number(row.received_bytes) + payload.length > Number(row.total_bytes)) throw new HttpError(413, 'transfer_size_mismatch', 'Received parts exceed the declared transfer size');
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO snapshot_transfer_parts (transfer_id,part_index,size,digest,payload) VALUES (?,?,?,?,?)').run(id, partIndex, payload.length, digest, payload);
    db.prepare('UPDATE snapshot_transfers SET received_bytes=received_bytes+?, updated_at=? WHERE id=?').run(payload.length, timestamp, id);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return mapSnapshotTransferStatus(db, db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id));
}

function commitSnapshotTransfer(db, rawId, timestamp) {
  const id = requireTransferId(rawId);
  const row = db.prepare('SELECT * FROM snapshot_transfers WHERE id = ?').get(id);
  if (!row) throw new HttpError(404, 'transfer_not_found', 'Snapshot transfer was not found or has expired');
  if (row.state === 'committed') return mapSnapshotTransferStatus(db, row);
  const parts = db.prepare('SELECT part_index,payload FROM snapshot_transfer_parts WHERE transfer_id=? ORDER BY part_index').all(id);
  if (parts.length !== Number(row.total_parts) || parts.some((part, index) => Number(part.part_index) !== index)) throw new HttpError(409, 'parts_missing', 'Snapshot transfer is not complete');
  const payload = Buffer.concat(parts.map((part) => Buffer.from(part.payload)));
  if (payload.length !== Number(row.total_bytes)) throw new HttpError(409, 'transfer_size_mismatch', 'Snapshot transfer size does not match its manifest');
  if (createHash('sha256').update(payload).digest('hex') !== row.digest) throw new HttpError(409, 'transfer_digest_mismatch', 'Snapshot transfer SHA-256 does not match its manifest');
  let snapshot;
  try { snapshot = JSON.parse(payload.toString('utf8')); } catch { throw new HttpError(400, 'invalid_json', 'Snapshot transfer is not valid JSON'); }
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new HttpError(400, 'invalid_payload', 'Snapshot must be an object');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT * FROM snapshot_transfers WHERE id=?').get(id);
    if (readSyncRevision(db) !== Number(current.base_revision)) throw new HttpError(409, 'revision_conflict', `Sync revision changed from ${current.base_revision} to ${readSyncRevision(db)}`);
    mergeSnapshotInTransaction(db, snapshot);
    const committedRevision = bumpSyncRevision(db);
    const expiresAt = new Date(Date.parse(timestamp) + TRANSFER_RECEIPT_TTL_MS).toISOString();
    db.prepare("UPDATE snapshot_transfers SET state='committed',updated_at=?,expires_at=?,committed_revision=? WHERE id=?").run(timestamp, expiresAt, committedRevision, id);
    db.prepare('DELETE FROM snapshot_transfer_parts WHERE transfer_id=?').run(id);
    db.exec('COMMIT');
    return mapSnapshotTransferStatus(db, db.prepare('SELECT * FROM snapshot_transfers WHERE id=?').get(id));
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function mapSnapshotTransferStatus(db, row) {
  return {
    protocol: SNAPSHOT_TRANSFER_PROTOCOL, transferId: row.id, state: row.state, sha256: row.digest,
    totalBytes: Number(row.total_bytes), totalParts: Number(row.total_parts), receivedBytes: Number(row.received_bytes),
    receivedParts: row.state === 'committed' ? [] : db.prepare('SELECT part_index FROM snapshot_transfer_parts WHERE transfer_id=? ORDER BY part_index').all(row.id).map((part) => Number(part.part_index)),
    baseRevision: Number(row.base_revision), committedRevision: row.committed_revision == null ? undefined : Number(row.committed_revision),
    expiresAt: row.expires_at, updatedAt: row.updated_at,
  };
}

function cleanupSnapshotTransfers(db, timestamp = new Date().toISOString()) {
  db.prepare('DELETE FROM snapshot_transfers WHERE expires_at <= ?').run(timestamp);
}

function requireTransferId(value) {
  const id = String(value ?? '').trim();
  if (!id || id.length > 200) throw new HttpError(400, 'invalid_transfer_id', 'transferId is required and must not exceed 200 characters');
  return id;
}

function requireSha256(value) {
  const digest = String(value ?? '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(digest)) throw new HttpError(400, 'invalid_digest', 'sha256 must be a SHA-256 hex digest');
  return digest;
}

function requirePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new HttpError(400, 'invalid_manifest', `${label} must be a positive integer`);
  return number;
}

function requireNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new HttpError(400, 'invalid_manifest', `${label} must be a non-negative integer`);
  return number;
}

export function readSnapshot(db) {
  return {
    connections: readConnections(db),
    rooms: readRooms(db),
    messagesByRoom: readMessagesByRoom(db),
    squareEvents: readEvents(db),
    collaborationEvents: readExtraState(db, 'collaborationEvents', []),
    delegationTasks: readExtraState(db, 'delegationTasks', []),
    teamTemplates: readExtraState(db, 'teamTemplates', []),
    profileVersions: readExtraState(db, 'profileVersions', []),
    updatedAt: latestUpdatedAt(db),
  };
}

function upsertConnection(db, connection) {
  const existing = db.prepare('SELECT updated_at FROM connections WHERE id = ?').get(connection.id);
  if (existing && compareIso(existing.updated_at, connection.updatedAt) > 0) return;
  db.prepare(`
    INSERT INTO connections (id, name, base_url, api_key, model, enabled, profile_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      model = excluded.model,
      enabled = excluded.enabled,
      profile_json = excluded.profile_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    connection.id,
    connection.name,
    connection.baseUrl,
    connection.apiKey ?? '',
    connection.model,
    connection.enabled ? 1 : 0,
    connection.profile ? JSON.stringify(connection.profile) : null,
    connection.createdAt,
    connection.updatedAt,
  );
}

function upsertRoom(db, room) {
  const existing = db.prepare('SELECT updated_at FROM rooms WHERE id = ?').get(room.id);
  if (existing && compareIso(existing.updated_at, room.updatedAt) > 0) return;
  db.prepare(`
    INSERT INTO rooms (id, name, kind, session_key, session_ids, member_session_keys, context_limit, room_mode, default_mode, summary_connection_id, auto_delegation_enabled, max_delegation_depth, last_summary_json, memory_capsule_json, roleplay_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      kind = excluded.kind,
      session_key = excluded.session_key,
      session_ids = excluded.session_ids,
      member_session_keys = excluded.member_session_keys,
      context_limit = excluded.context_limit,
      room_mode = excluded.room_mode,
      default_mode = excluded.default_mode,
      summary_connection_id = excluded.summary_connection_id,
      auto_delegation_enabled = excluded.auto_delegation_enabled,
      max_delegation_depth = excluded.max_delegation_depth,
      last_summary_json = excluded.last_summary_json,
      memory_capsule_json = excluded.memory_capsule_json,
      roleplay_json = excluded.roleplay_json,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  `).run(
    room.id,
    room.name,
    room.kind,
    room.sessionKey,
    JSON.stringify(room.sessionIds ?? {}),
    JSON.stringify(room.memberSessionKeys ?? {}),
    room.contextLimit ?? null,
    room.mode ?? null,
    room.defaultCollaborationMode ?? null,
    room.summaryConnectionId ?? null,
    room.autoDelegationEnabled == null ? null : room.autoDelegationEnabled ? 1 : 0,
    room.maxDelegationDepth ?? null,
    room.lastSummary ? JSON.stringify(room.lastSummary) : null,
    room.memoryCapsule ? JSON.stringify(room.memoryCapsule) : null,
    room.roleplay ? JSON.stringify(room.roleplay) : null,
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
    INSERT INTO messages (id, room_id, role, author_id, author_name, content, status, error, hermes_run_id, hermes_transport, hermes_run_status, recovery_attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      room_id = excluded.room_id,
      role = excluded.role,
      author_id = excluded.author_id,
      author_name = excluded.author_name,
      content = excluded.content,
      status = excluded.status,
      error = excluded.error,
      hermes_run_id = excluded.hermes_run_id,
      hermes_transport = excluded.hermes_transport,
      hermes_run_status = excluded.hermes_run_status,
      recovery_attempts = excluded.recovery_attempts,
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
    message.hermesRunId ?? null,
    message.hermesTransport ?? null,
    message.hermesRunStatus ?? null,
    message.recoveryAttempts ?? null,
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

function upsertExtraState(db, key, value) {
  db.prepare(`
    INSERT INTO extra_state (key, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value ?? []), new Date().toISOString());
}

function readExtraState(db, key, fallback) {
  const row = db.prepare('SELECT value_json FROM extra_state WHERE key = ?').get(key);
  return parseJsonObject(row?.value_json) ?? fallback;
}

function readConnections(db) {
  return db.prepare('SELECT * FROM connections ORDER BY updated_at ASC').all().map((row) => ({
    id: row.id,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: row.model,
    enabled: Boolean(row.enabled),
    profile: parseJsonObject(row.profile_json),
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
    sessionIds: parseJsonObject(row.session_ids) ?? {},
    sessionKey: row.session_key,
    memberSessionKeys: parseJsonObject(row.member_session_keys) ?? {},
    contextLimit: row.context_limit ?? undefined,
    mode: row.room_mode ?? undefined,
    defaultCollaborationMode: row.default_mode ?? undefined,
    summaryConnectionId: row.summary_connection_id ?? undefined,
    autoDelegationEnabled: row.auto_delegation_enabled == null ? undefined : Boolean(row.auto_delegation_enabled),
    maxDelegationDepth: row.max_delegation_depth ?? undefined,
    lastSummary: parseJsonObject(row.last_summary_json) ?? undefined,
    memoryCapsule: parseJsonObject(row.memory_capsule_json) ?? undefined,
    roleplay: parseJsonObject(row.roleplay_json) ?? undefined,
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
      hermesRunId: row.hermes_run_id ?? undefined,
      hermesTransport: row.hermes_transport ?? undefined,
      hermesRunStatus: row.hermes_run_status ?? undefined,
      recoveryAttempts: row.recovery_attempts ?? undefined,
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

function parseJsonObject(text) {
  if (!text) return undefined;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : undefined;
  } catch {
    return undefined;
  }
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
  const text = (await readBody(request, MAX_JSON_BYTES)).toString('utf8');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
  }
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let size = 0;
  const declaredLength = Number(request.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new HttpError(413, 'payload_too_large', `Request body exceeds ${maxBytes} bytes`);
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'payload_too_large', `Request body exceeds ${maxBytes} bytes`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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
