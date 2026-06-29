# Laphiny

> Put your existing Hermes Soul / Agent instances into shared rooms, keep their own personalities and memories intact, and let them collaborate through shared transcripts, mentions, delegation, room memory, task boards, and structured rituals.

Laphiny is a local-first multi-agent chat client for **Web/PWA** and **Android APK**. It is designed for agents that already exist, already have their own souls, and already carry their own long-term memory. Laphiny provides the room, transcript, collaboration protocol, attachments, sync, and mobile interface around them.

Chinese documentation: [README.md](./README.md)

---

## Contents

- [Positioning](#positioning)
- [Features](#features)
- [What Is New In v0.13.0](#what-is-new-in-v0130)
- [Project Layout](#project-layout)
- [Quick Start](#quick-start)
- [Build And Release](#build-and-release)
- [Sync Server](#sync-server)
- [Hermes Gateway](#hermes-gateway)
- [Privacy](#privacy)
- [Credits](#credits)

---

## Positioning

Laphiny is **Soul-native, not Prompt-native**.

| Traditional multi-agent clients | Laphiny |
| --- | --- |
| Create temporary role prompts inside the client | Use agents that already exist and already have their own soul |
| Switch between models | Let agents collaborate |
| Mix all replies into one generic context | Preserve each agent's identity and session |
| No structured collaboration flow | `/council`, `/redteam`, `/review`, `/retro` |
| No room-level memory | Room memory capsules, consensus summaries, task boards |

Laphiny is useful for:

- Developers and technical teams: code review, design review, risk analysis, task breakdown
- Writers and creators: co-writing, roleplay, worldbuilding, continuity work
- Personal AI teams: bring your own agents into one room and make them work together

---

## Features

### Connections And Rooms

- Add, edit, delete, and test Hermes Gateway connections
- Direct rooms and group rooms
- Member aliases, enable/disable controls, context limits, and room modes
- Agent collaboration profiles and profile history
- Export rooms as JSON or Markdown

### Chat And Collaboration

- Hermes SSE streaming, stop generation, and retry
- `@member` targeted replies
- `@all` parallel replies and `@all-seq` sequential handoff
- Assistant-to-assistant delegation through line-start `@member task`
- Delegation quality gates and maximum depth limits
- Collaboration rituals: `/council`, `/redteam`, `/review`, `/retro`
- Goal mode with review rounds and notifications only after automatic completion or stop

### Files And Attachments

- Image uploads as `image_url` content parts
- Text files injected as bounded `<attachment>` context
- Agents can return downloadable files through `laphiny-file` blocks
- Supported returned file types: `.txt`, `.md`, `.png`, `.jpg`, `.jpeg`
- Returned files appear as attachment cards after the message and can be downloaded with one tap

### Mobile Experience

- On small phones, choosing a room enters a focused chat view
- The bottom navigation remains available
- The top bar only shows the current chat name and a back button
- Room settings, members, and tools are configured before entering focused chat
- The composer is lifted above the keyboard on Android/iOS where possible

### Notifications And Permission Requests

- Local system notifications when an agent completes a full reply
- Goal mode notifications only when the goal workflow completes or stops
- Permission requests are recognized and rendered as action cards under the message
- Users can allow, deny, or always allow directly from the card
- Permission requests also notify the user because they require action
- When the app is in the foreground, system notifications are suppressed

### Data And Sync

- Global search
- Full backup and merge restore
- PWA offline support
- Optional Node.js + SQLite sync server for snapshots, events, and conflict preflight

---

## What Is New In v0.13.0

- Focused mobile chat flow for small screens
- More reliable Android attachment downloads
- Agent-generated file blocks become downloadable message attachment cards
- Local notifications for completed replies, goal completion/stop, and permission requests
- Foreground notification suppression
- Permission request recognition with Allow, Deny, and Always Allow actions
- English README

---

## Project Layout

```text
laphiny/
├── App.tsx                    # Main app: UI, state, dispatch, rooms, square, settings
├── index.ts                   # Expo entry
├── package.json               # Scripts and dependencies
├── app.json                   # Expo / PWA / Android config
├── android/                   # Android native project
├── public/                    # PWA service worker and offline fallback
├── scripts/
│   ├── sync-server.mjs        # Node + SQLite sync service
│   ├── fix-web-paths.mjs      # Fix /laphiny/ web asset paths
│   └── run-gradle.mjs         # Cross-platform Gradle wrapper runner
├── src/
│   ├── app/                   # App-level types, utilities, chat history builders
│   ├── components/            # Shared UI primitives and Markdown renderer
│   ├── config/                # Version, defaults, quick commands
│   ├── lib/                   # Testable pure logic modules
│   ├── storage/               # Web / native storage abstraction
│   └── types.ts               # Core domain types
├── tests/                     # Node test + tsx test suite
├── docs/                      # Help and design docs
└── dist/                      # Web build output
```

Important logic modules:

- `src/lib/hermes_client.ts`: Hermes API client
- `src/lib/mentions.ts`: mention routing and delegation parsing
- `src/lib/agent_files.ts`: agent file block extraction
- `src/lib/agent_permissions.ts`: agent permission request extraction
- `src/lib/goal_mode.ts`: goal prompts and state parsing
- `src/lib/sync_client.ts` / `src/lib/sync_conflicts.ts`: sync client and conflict checks

---

## Quick Start

```bash
git clone https://github.com/NianSue1101/laphiny.git
cd laphiny
npm install

npm run start
npm run web
```

Validation:

```bash
npm run typecheck
npm test
npm run web:build
```

The current test suite has 54 tests, mostly covering pure logic under `src/lib/*`.

---

## Build And Release

### Web / PWA

Always build web assets with:

```bash
npm run web:build
```

Do not call `npx expo export --platform web` directly. This project is deployed under the `/laphiny/` subpath, and `npm run web:build` runs `scripts/fix-web-paths.mjs` after export so `/_expo`, `/assets`, and favicon references are rewritten correctly.

Example nginx config:

```nginx
location /laphiny/ {
    alias /path/to/dist/;
    index index.html;
    try_files $uri $uri/ /laphiny/index.html;
}
```

### Android APK

Use JDK 17 or 21 for local Gradle builds:

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

Both Windows and Unix builds go through `scripts/run-gradle.mjs`.

---

## Sync Server

The sync server is optional. It can store remote snapshots on your own cloud server and let the app sync on startup or foreground resume.

```bash
LAPHINY_SYNC_API_KEY='your-secret' LAPHINY_SYNC_PORT=8787 node scripts/sync-server.mjs
```

Endpoints:

- `GET /v1/health`
- `GET /v1/snapshot`
- `PUT /v1/snapshot`
- `GET /v1/events`
- `POST /v1/events`

For production, run it under systemd and expose it through HTTPS reverse proxy.

---

## Hermes Gateway

Example setup:

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<your-api-key>'
hermes config set platforms.api_server.cors_origins '["https://your-domain.com"]'
hermes gateway restart
```

For production, expose the gateway through HTTPS and configure CORS to allow `X-Hermes-Session-Id` and `X-Hermes-Session-Key`.

---

## Privacy

- Release builds must not include private Hermes URLs, API keys, personal sync backends, or local connection backups
- Full backups may contain API keys; store them only in trusted locations
- Diagnostic bundles redact connection keys and token fields
- By default, local data stays on the current device; when sync is enabled, your remote server stores snapshot data

---

## Credits

- **NianSue1101**: project creator, architecture, core development
- **Flor**: Hermes Agent, collaboration and morale
- **Laper**: Hermes Agent, code and server operations
- **Arilphin**: Hermes Agent
- **Derux**: Hermes Agent, development records
- **Deepseek + ChatGPT + GLM**: code generation support

Technology:

- [Expo](https://expo.dev/)
- [React Native](https://reactnative.dev/)
- [Hermes Agent](https://github.com/NianSue1101/hermes-agent)
- [Ionicons](https://ionic.io/ionicons)

Contributions are welcome. Before opening a PR:

1. Run `npm run typecheck`, `npm test`, and `npm run web:build`
2. Do not commit real API keys, Gateway URLs, or private connection backups
3. For group chat, delegation, or collaboration behavior, prefer updating `src/app/chat_history.ts` and testable `src/lib/*` modules
