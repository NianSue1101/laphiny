# Laphiny Sync API

This file documents the legacy in-repository reference server. New production deployments use the standalone `laphiny-sync` project, which preserves the endpoints below and adds durable Agent-initiated room messages, room-scoped bindings, cursor recovery, acknowledgements, and SSE.

`scripts/sync-server.mjs` remains available for compatibility tests and local snapshot development, but it does not implement proactive Agent replies.

## Run The Reference Server

```bash
LAPHINY_SYNC_DB=./laphiny-sync.sqlite \
LAPHINY_SYNC_HOST=0.0.0.0 \
LAPHINY_SYNC_PORT=8787 \
LAPHINY_SYNC_API_KEY='<a-long-random-secret>' \
npm run sync:server
```

Then configure Laphiny's Soul Atrium tab with:

- Base URL: `http://<laper-tablet-ip>:8787`
- API Key: the same `LAPHINY_SYNC_API_KEY`

## Authentication

Clients send `Authorization: Bearer <sync-api-key>` when a key is configured.

## Endpoints

### `GET /v1/health`

Returns service status.

```json
{ "status": "ok", "updatedAt": "2026-06-26T00:00:00.000Z" }
```

### `GET /v1/snapshot`

Returns the full app snapshot used for simple multi-device bootstrap.

```json
{
  "connections": [],
  "rooms": [],
  "messagesByRoom": {},
  "squareEvents": [],
  "updatedAt": "2026-06-26T00:00:00.000Z"
}
```

### `PUT /v1/snapshot`

Accepts the same snapshot shape and returns the merged snapshot stored by the backend.

Legacy `GET`/`PUT` remain available for small snapshots. New clients inspect `GET /v1/health`; when
`capabilities.snapshotTransfers.protocol` is `laphiny.snapshot-transfer.v1`, snapshots larger than the
legacy request-body budget use the resumable transfer flow below. A server can advertise
`maxPartBytes`, `maxTransferBytes`, `maxParts`, and `ttlMs` together with its monotonic
`syncRevision`.

### Resumable large snapshot upload

1. `POST /v1/snapshot-transfers` initializes or resumes a client-generated stable `transferId` with
   `sha256`, `totalBytes`, `totalParts`, and the `baseRevision` read from health.
2. `PUT /v1/snapshot-transfers/:id/parts/:index` uploads one UTF-8 payload part. Repeating an identical
   part is successful; reusing an index with different bytes returns `409 part_conflict`.
3. `GET /v1/snapshot-transfers/:id` returns durable `receivedParts`, byte counts, expiry, state, and a
   commit receipt so a client can recover after an ambiguous timeout or disconnect.
4. `POST /v1/snapshot-transfers/:id/commit` verifies every part, the declared size and SHA-256, then
   applies the complete JSON snapshot and advances the revision in one SQLite transaction. It returns
   a small receipt rather than echoing the full snapshot. Repeating commit returns the same receipt.

Commit returns `409 revision_conflict` if another legacy or transfer write advanced the server after
initialization; no partial snapshot is applied. Incomplete transfers expire and are cleaned up, while
committed receipts are retained longer for safe response-loss retries. Deployments should keep the
SQLite volume persistent because transfer state and receipts live in the same database.
The backend should merge by `id` for connections, rooms, messages, and square events.

### `GET /v1/events?since=<iso-date>`

Returns square events newer than `since`. If `since` is omitted, returns recent events.
Laphiny polls this endpoint while sync is enabled, so backend-side events can appear in Soul Atrium without a full snapshot pull.

### `POST /v1/events`

Appends one square event and returns the stored event.

## SQLite Tables

- `connections(id, name, base_url, api_key, model, enabled, created_at, updated_at)`
- `rooms(id, name, kind, session_key, context_limit, created_at, updated_at)`
- `room_members(room_id, connection_id, alias, enabled)`
- `messages(id, room_id, role, author_id, author_name, content, status, error, created_at)`
- `attachments(id, message_id, name, mime_type, size, uri, data_url, text, kind)`
- `square_events(id, kind, source, target, room_id, room_name, title, body, created_at)`
