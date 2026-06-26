# Laphiny Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an open-source Hermes-first chat app named Laphiny, with Android APK output and Web/PWA output, supporting multiple Hermes Gateway API connections, group rooms, @mention routing, text chat, image upload, and document attachment context.

**Architecture:** Expo + React Native Web single codebase. The app stores Hermes endpoints locally, stores rooms and chat messages locally, calls each Hermes through the OpenAI-compatible API Server (`/v1/chat/completions`) with `X-Hermes-Session-Id` and `X-Hermes-Session-Key`, and implements group chat client-side by dispatching one request per mentioned Hermes member. Images are embedded as `data:image/...` multimodal content parts because Hermes API Server supports inline image URLs/data URLs. Non-image files are converted to textual attachment context in the client because the API Server currently rejects `input_file` parts.

**Tech Stack:** Expo SDK 54, React 19, React Native 0.81, TypeScript strict mode, expo-secure-store, expo-image-picker, expo-document-picker, expo-file-system, OpenAI Chat Completions compatible Hermes Gateway API.

---

## API facts verified from Hermes Agent source

- Health: `GET /health`, `GET /health/detailed`, `GET /v1/health`.
- Models: `GET /v1/models` requires auth if API key is configured.
- Chat: `POST /v1/chat/completions`.
- Streaming: `stream: true` returns SSE with OpenAI chat chunks plus `event: hermes.tool.progress` lifecycle events.
- Session continuation: pass `X-Hermes-Session-Id`; requires API key authentication.
- Stable chat memory scope: pass `X-Hermes-Session-Key`.
- Images: message content may contain `image_url` / `input_image` with `http(s)` URLs or `data:image/...` URLs.
- Files: `file` / `input_file` parts are rejected; convert supported text files to plain text context in Laphiny until Hermes adds file upload endpoints.

## Phases

### Phase 1: Project scaffold
- Copy the Expo APK/Web build approach from iHermes: `expo run:android`, local Gradle `assembleDebug`, `expo export --platform web`, and optional EAS preview APK.
- Create strict TypeScript project metadata and docs.

### Phase 2: Core domain and API client
- Define `HermesConnection`, `Room`, `RoomMember`, `ChatMessage`, `Attachment` types.
- Implement @mention parsing:
  - `@name` targets matching room members.
  - `@all` targets all enabled room members.
  - Chinese full-width `＠` also works.
  - If a group room has no mention, default to no dispatch to avoid accidental multi-agent loops.
  - If a direct room has no mention, dispatch to its only member.
- Implement multimodal payload building:
  - Text-only message becomes a string.
  - Images become `[{ type: 'text' }, { type: 'image_url', image_url: { url: dataUrl } }]`.
  - Text documents are appended to the text as bounded `<attachment>` blocks.
- Implement Hermes client with health/models/chat, auth header, session headers, and streaming parser.

### Phase 3: Local storage
- Store connections in SecureStore on native, localStorage on Web fallback.
- Store rooms and messages locally.
- Keep API keys in the connection record for MVP; document that production shared deployments should add an app backend/proxy.

### Phase 4: UI MVP
- Three-pane responsive layout on Web; stacked mobile layout on Android.
- Connections screen: add/edit/test Hermes endpoints.
- Rooms screen: create direct room or group room, choose members, rename room.
- Chat screen: message list, composer, @mention chips, attachment buttons.
- Display pending/running/sent/error states per Hermes reply.

### Phase 5: Verification
- Unit tests for mention routing and payload building.
- Typecheck.
- `npm run web:build`.
- Android APK docs: local prebuild and EAS preview.
