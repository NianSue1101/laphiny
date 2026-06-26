# Laphiny Sync API

This is the lightweight contract for a future SQLite-backed sync service running on Laper's tablet or another trusted device.

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

### `POST /v1/events`

Appends one square event and returns the stored event.

## SQLite Tables

- `connections(id, name, base_url, api_key, model, enabled, created_at, updated_at)`
- `rooms(id, name, kind, session_key, context_limit, created_at, updated_at)`
- `room_members(room_id, connection_id, alias, enabled)`
- `messages(id, room_id, role, author_id, author_name, content, status, error, created_at)`
- `attachments(id, message_id, name, mime_type, size, uri, data_url, text, kind)`
- `square_events(id, kind, source, target, room_id, room_name, title, body, created_at)`
