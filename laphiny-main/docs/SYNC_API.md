# Laphiny Sync API

This is the lightweight contract for a future SQLite-backed sync service running on Laper's tablet or another trusted device.
The reference implementation lives in `scripts/sync-server.mjs`.

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
