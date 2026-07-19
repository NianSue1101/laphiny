# Laphiny

> Put your existing Hermes Soul / Agent instances into shared rooms, keep their own personalities and memories intact, and let them collaborate through shared transcripts, mentions, delegation, room growth layers, task boards, and structured rituals.

Laphiny is a local-first multi-agent collaboration space for **Web/PWA** and **Android APK**. It is designed for agents that already exist, already have their own souls, and already carry their own long-term memory. Laphiny provides the room, transcript, collaboration protocol, attachments, sync, mobile interface, and a room-level growth layer where shared knowledge, open blackboard items, decisions, and Soul relationships can accumulate over time.

Chinese documentation: [README.md](./README.md)

---

## Contents

- [Positioning](#positioning)
- [Features](#features)
- [What Is New In v0.35.1](#what-is-new-in-v0351)
- [What Is New In v0.35.0](#what-is-new-in-v0350)
- [What Is New In v0.34.0](#what-is-new-in-v0340)
- [What Is New In v0.33.0](#what-is-new-in-v0330)
- [What Is New In v0.32.3](#what-is-new-in-v0323)
- [What Is New In v0.32.2](#what-is-new-in-v0322)
- [What Is New In v0.32.1](#what-is-new-in-v0321)
- [What Is New In v0.32.0](#what-is-new-in-v0320)
- [What Is New In v0.30.3](#what-is-new-in-v0303)
- [What Is New In v0.30.2](#what-is-new-in-v0302)
- [What Is New In v0.22.1](#what-is-new-in-v0221)
- [What Is New In v0.22.0](#what-is-new-in-v0220)
- [What Is New In v0.20.0](#what-is-new-in-v0200)
- [What Is New In v0.14.1](#what-is-new-in-v0141)
- [What Is New In v0.14.0](#what-is-new-in-v0140)
- [Project Layout](#project-layout)
- [Quick Start](#quick-start)
- [Build And Release](#build-and-release)
- [Sync Server](#sync-server)
- [Feedback Server](#feedback-server)
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
| No room-level memory | Memory confirmation, room knowledge, blackboards, decision records, task boards |

Laphiny is useful for:

- Developers and technical teams: code review, design review, risk analysis, task breakdown
- Writers and creators: co-writing, roleplay, worldbuilding, continuity work
- Personal AI teams: bring your own agents into one room and make them work together

### User Role

In Laphiny, the user is not merely a prompt sender. The user is the **room convener, relationship steward, and final decision maker**:

- The user decides which Hermes Souls enter a room, and how they appear through aliases, avatars, and collaboration modes
- The user sets goals, judges whether outputs are useful, and confirms which memories deserve to become long-term room context
- The user does not need to treat agents as disposable tools, nor become a prompt-tuning operator; they are closer to someone running a studio, council, or tabletop session
- Agents may delegate to each other, cite each other, and form stable partnerships, but the user still owns direction, privacy, and boundaries

### Agent Growth

Laphiny does not overwrite an agent's private Hermes soul. Growth happens at the room layer:

1. When an agent first enters a room, it only has its public collaboration profile, alias, and a small shared transcript.
2. After several rounds, the room gains delegation tasks, consensus summaries, blackboard items, and early relationship edges.
3. When the user confirms a memory draft, stable facts enter the room knowledge base, open questions enter the blackboard, and important tradeoffs enter decision records.
4. Over time, agents are no longer just called models; inside this room, they know the boundaries, remember shared decisions, recognize collaborators, and behave more like a team familiar with the user's style.

---

## Features

### Connections And Rooms

- Add, edit, delete, and test Hermes Gateway connections
- Direct rooms and group rooms
- Member aliases, enable/disable controls, context limits, and room modes
- Agent collaboration profiles and profile history
- Export rooms as JSON or Markdown

### Chat And Collaboration

- Hermes SSE streaming, stop generation, and retry; Android uses a native streaming transport instead of waiting for the complete body
- Explicit Hermes tool/system activity, such as memory or skill operations, appears as a separate small status line instead of being mixed into content or reasoning
- Exact `@member` targeted replies, including aliases with spaces
- `@all` parallel replies and `@all-seq` sequential handoff
- Assistant-to-assistant delegation through line-start `@member task`
- Keep sending to another member or room while an agent streams; turns for the same Soul remain ordered
- Delegation quality gates and maximum depth limits
- Collaboration rituals: `/council`, `/redteam`, `/review`, `/retro`
- Goal mode with review rounds and notifications only after automatic completion or stop
- Agent room-state interface: agents can emit `laphiny-room-state` blocks that Laphiny writes into the knowledge base, blackboard, and decision records

### Room Growth Layer

- Room knowledge base for stable facts, user preferences, project constraints, and handoff notes
- Collaboration blackboard for open questions, next actions, and pinned temporary focus
- Decision records for confirmed tradeoffs and boundaries, with superseded decisions kept separate
- Agents can submit structured state patches, so they can move room goals forward instead of leaving every update as plain chat text
- Memory sediment confirmation: agents produce drafts first, and the user confirms them before they enter long-term room context
- Soul relation graph based on delegation, completion, and mutual references
- The growth layer is injected into later prompts, so a room can move from "newly convened" to "stable collaboration" over time

### Files And Attachments

- Image uploads as `image_url` content parts
- Text files injected as bounded `<attachment>` context
- Agents can return downloadable files through `laphiny-file` blocks
- Supported returned file types: `.txt`, `.md`, `.png`, `.jpg`, `.jpeg`
- Returned files appear as attachment cards after the message; tapping opens a preview first, with a download button in the upper-right corner
- On Android, the first selected download directory is reused for later attachments, backups, and diagnostics JSON exports

### Mobile Experience

- On small phones, choosing a room enters a focused chat view
- The bottom navigation remains available
- The top bar only shows the current chat name and a back button
- The chat picker can expand the selected room for inline room name, member, mode, context, and avatar edits
- The composer is lifted above the keyboard on Android/iOS where possible

### Personalization And Feedback

- Light and dark mode
- Optional dates in message timestamps for cross-day conversations
- System font and LXGW WenKai font selection, with room for more fonts later
- Agent avatars can be changed from the connections page or the mobile room picker
- User-facing toggles are grouped in Settings; diagnostic logs stay collapsed until requested and include full timestamps
- Default feedback server for upload-only redacted diagnostics; server logs are not pulled back into the app

### Notifications And Permission Requests

- Local system notifications when an agent completes a full reply
- Goal mode notifications only when the goal workflow completes or stops
- Permission requests are recognized and rendered as action cards under the message
- Users can allow, deny, or always allow directly from the card
- Always Allow is stored locally and scoped to the exact Agent connection and normalized request
- Permission requests also notify the user because they require action
- When the app is in the foreground, system notifications are suppressed

### Data And Sync

- Global search
- Full backup and merge restore
- PWA offline support
- Optional self-hosted `laphiny-sync` service for snapshots, settings, conflict preflight, events, and Agent-initiated replies to an exact room

---

## What Is New In v0.35.1

- **Disconnect recovery**: Laphiny now uses the Hermes Runs API when the Gateway explicitly advertises it. The `run_id` is persisted immediately, so the same server-side task can be reconciled after network loss, backgrounding, or screen lock without starting a duplicate Agent turn.
- **Safe fallback for older Gateways**: classic Chat Completions and Responses SSE requests are cancelled by Hermes when their client disconnects. Laphiny now detects unexpected EOF, remote failure, and length truncation. It may start one clearly labelled continuation only when no tool or permission side effects were observed; otherwise it preserves the partial reply and asks for manual confirmation.
- **Mobile layout fix**: prevents horizontal overflow in the room picker on narrow screens and with large fonts. Leaving a chat immediately invalidates queued scroll work, so a stale animation frame cannot scroll the wrong view.
- **Large snapshot sync**: the updated sync server negotiates a resumable transfer protocol with UTF-8-safe parts, SHA-256 verification, idempotent retries, status queries, commit receipts, and `baseRevision` CAS. Small snapshots retain the legacy endpoint; a legacy server that returns 413 now produces an actionable upgrade message.
- **Recovery state survives sync**: run IDs, transport, recovery attempts, and the `interrupted` status round-trip through snapshots without turning unfinished replies into successful ones.

Limitation: reconnecting to the same server-side task requires a Gateway that explicitly supports the Runs API. Older SSE endpoints do not provide true resume semantics, and Laphiny will not infer hidden server state or automatically replay work that may have side effects.

## What Is New In v0.35.0

- **Proactive Agent replies:** scheduled tasks, background scripts, and long-running work can deliver results after the original chat request has ended. Each result returns to an exact Laphiny room under the bound Agent identity.
- **Durable delivery and recovery:** foreground SSE provides real-time delivery with a 15-second recovery pull. Messages are committed to server-side SQLite and local chat history before the device cursor is acknowledged. Event IDs, monotonic sequences, and idempotency keys prevent reconnects and retries from losing or duplicating messages.
- **Least-privilege bindings:** Settings can create, copy, and revoke an exact “room × Agent” delivery configuration. A binding cannot read chat history, snapshots, or settings, target another room, or impersonate another member.
- **Standalone self-hosted backend:** production sync now lives at [`Lovely-Laper/laphiny-sync`](https://github.com/Lovely-Laper/laphiny-sync), with Docker Compose, automatic key generation, health checks, and a one-sentence deployment protocol that a server Agent can execute.
- **Boundary:** this release does not provide Android/iOS system-level remote push. Messages arrive in real time while Laphiny is active and are recovered when the app starts or returns to the foreground.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.35.0`; Android uses `versionCode 350`. The automated suite contains 132 tests.

---

## What Is New In v0.34.0

- **Lower-density UI:** connections, room tools, mobile details, settings, onboarding, and the composer now prioritize frequent actions and disclose secondary controls on demand. Existing capabilities remain available, while destructive actions are separated from everyday work.
- **Open at the latest message:** every chat entry returns to the newest message. A compact “Latest” control appears only when at least 20 newer messages are below the viewport.
- **Inline delegation sheets:** every Agent delegation is shown directly after its source reply with source, assignee, state, task, deliverable/acceptance, error, and retry details. Users no longer have to discover a hidden collaboration drawer to confirm that a delegation exists.
- **Actionable notices:** delegation limits, tool delegation, memory drafts, paused goals, and RP notices expose focused actions in an in-chat bottom sheet that preserves scroll position and applies changes immediately. The ordinary per-reply delegation limit is now a room setting from 1 to 6 and is carried into Agent collaboration prompts and team templates.
- **Android device evidence:** a production-signed Release upgrade on an Android 16 emulator verified latest-message entry, inline delegation sheets, legacy-notice compatibility, focused settings, and immediate updates. The automated suite now contains 124 tests.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.34.0`; Android uses `versionCode 340`.

---

## What Is New In v0.33.0

- **Stable connection directory:** group and delegation prompts now carry `laphiny.connection-directory.v1`, containing only enabled room members, exact IDs, aliases, and public collaboration profiles. Gateway URLs, API keys, and models are excluded, so `laphiny_delegate_tasks` no longer has to guess an internal ID.
- **Actionable plugin diagnostics:** both the current `{ data: [...] }` and legacy array `/v1/toolsets` shapes are supported. Laphiny distinguishes a missing Responses API, missing plugin, disabled toolset, incompatible metadata, and probe failure, then provides remediation. Runtime Responses incompatibility appears as a small activity hint before a safe chat fallback; cancellation and timeouts never trigger a second request.
- **Delegation retry and reassignment:** failed task cards can retry or move the same logical task to another enabled member. Each execution records an attempt, operation ID, revision, target, terminal state, and assignment history. Duplicate taps are idempotent, stale attempt results cannot overwrite the current attempt, and unfinished attempts become interrupted after restart.
- **Whole-stream timeout policy:** connection timeout covers the period before response headers; idle timeout remains active for the complete body and resets on every raw chunk; user cancellation remains distinct. A delegation that times out after partial output becomes outcome-unknown instead of being falsely labelled a safe failure.
- **Background stream and Android performance:** the app header aggregates active Agents and rooms, with per-room phase counts. Android delta flushes are coalesced to 140 ms, a flush writes the message once, and unchanged message bubbles no longer re-render on every delta. Sending also re-locks the list to the newest bubble even after a very tall previous reply.
- **Redacted collaboration report:** group tools and the mobile room-details drawer can export a local JSON report through a strict allowlist. Agent names are pseudonymized; only structured terminal states, attempts, event kinds, and redacted goal evidence are included. URL, token, email, IP, path, or forbidden-field canaries block export. Chat text, attachments, private connection metadata, and hidden reasoning are never included.
- **Boundaries:** retry is a new Hermes request, not server-side stream resume. `outcome_unknown` means side effects cannot be proven after partial output. Laphiny does not invent a plugin version when the Gateway does not report one.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.33.0`; Android uses `versionCode 330`.

---

## What Is New In v0.32.3

- **Real Android streaming:** the native app now uses Expo's streaming fetch transport. Content deltas enter the message before request completion, while cancelled or failed partial replies remain explicitly unfinished.
- **Hermes activity hints:** `hermes.tool.progress` and Responses tool lifecycles are rendered as small in-message activity rows for server-reported memory, skill, and tool operations. Laphiny does not infer or expose hidden chain of thought.
- **Timestamp and settings cleanup:** message dates are optional; appearance, date, and reasoning toggles are grouped; diagnostic logs are collapsed by default and show full date/time after expansion.
- **Reliable permission continuation:** allow, deny, and always allow resume the original session. Persistent approvals are scoped per Agent and request, duplicate taps are ignored, and a permission-blocked delegation is not completed prematurely.
- **Delegation hardening:** full-width forms and Chinese/ASCII punctuation are normalized, ambiguous aliases are rejected, quoted or fenced examples do not dispatch, full task text is used for deduplication, and missing members or invalid tool payloads reach explicit terminal states.
- **Device evidence:** an Android emulator verified mid-stream rendering, activity hints, timestamp dates, collapsed logs, permission continuation, `@all-seq`, and agent-to-agent result flow. The automated suite now contains 104 tests.
- **Known boundaries:** structured tool delegation still depends on a compatible Hermes plugin receiving an exact room connection ID. Older plugins or missing IDs fail visibly and can use the line-start `@member task` compatibility path. One-tap reassignment and server-side stream resume remain future work.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.32.3`; Android uses `versionCode 323`.

---

## What Is New In v0.32.2

- **Hermes approval replies fixed:** the Allow, Deny, and Always Allow cards now send Hermes's required `/approve` or `/deny` control command in the same session instead of a natural-language explanation that leaves the blocked turn waiting. Always Allow remains a local Laphiny preference and automatically sends `/approve` for later matching requests.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.32.2`; Android uses `versionCode 322`.

## What Is New In v0.32.1

- **Hermes tool delegation, on by default:** after installing [`laphiny-hermes-delegation`](https://github.com/Lovely-Laper/laphiny-hermes-delegation), connection checks verify both the Responses API and the `laphiny_delegate_tasks` tool. Supported Agents submit real `function_call` events with an exact connection ID, task, deliverable, and acceptance criteria; Laphiny validates room membership, limits, and duplicates before scheduling.
- **One-command installation:** run `hermes plugins install Lovely-Laper/laphiny-hermes-delegation --enable && hermes gateway restart` on each Hermes Gateway. Older or unmodified Gateways keep the local structured-delegation compatibility path.
- **Room management:** the tool-delegation switch is available in group-room management and defaults to on. Opening a room returns to its latest message, and room deletion confirms and clears local paged history plus search indexes.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.32.1`; Android uses `versionCode 321`.

## What Is New In v0.32.0

- **Reliable long-history loading:** rooms hydrate only the newest pages, automatically load one older page near the top, and keep an explicit retry action. Page indexes now have backup recovery and validation; unrecoverable corruption is reported instead of silently becoming an empty chat.
- **Lightweight full-history search:** each page keeps a minimal search document. Search identifies matching pages before loading message bodies, while a 50,000-message room still starts from a fixed two-page window.
- **Independent agent scheduling:** locks are scoped to room plus connection. One agent keeps ordered session turns while unrelated rooms and agents can stream concurrently, with background status visible in room navigation.
- **Exact mentions and structured delegation:** full aliases and connection IDs are boundary-matched; duplicate aliases present candidates instead of guessing. Delegations persist their goal, input, deliverable, acceptance criteria, evidence, and retry lineage.
- **Iterative Goal mode:** goals carry a plan, dependencies, acceptance criteria, evidence, review history, and next action across planning / running / reviewing / adjusting states. Completion requires verified evidence; repeated no-progress or the round limit safely pauses for the user.
- **Unified streaming lifecycle:** replies move through queued, connecting, thinking, responding, delegating, reviewing, and terminal phases. Work left running across an app restart is marked interrupted and can be retried against the exact agent.
- **Optional reasoning display:** off by default and limited to explicit `reasoning/thinking` fields returned by compatible services. Reasoning stays separate from user-facing content and is throttled; Laphiny does not invent or expose hidden model thought.
- **Known boundaries:** retry starts a new request rather than resuming a server transport. A Goal run defaults to at most five rounds and pauses after two no-progress reviews to avoid an unbounded loop or unintended spend.
- **Unified version metadata:** in-app, Expo, npm, and Android versions report `0.32.0`; Android uses `versionCode 320`.

---

## What Is New In v0.30.3

- **On-demand older messages:** a room can load one earlier local page at a time while preserving the current reading position.
- **Full paged-history search:** complete pages are read only while search is active and released when the query is cleared, keeping normal startup lightweight.
- **Page cleanup fix:** clearing a room removes indexed pages from page zero instead of leaving older indexed history behind.
- **Unified version metadata:** in-app, Expo, npm, and Android versions now consistently report `0.30.3`.

---

## What Is New In v0.30.2

- **Faster Android history:** chat storage now uses per-room pages. Existing history is migrated once; later launches load only the newest two pages per room while retaining the full local history.
- **Concurrent collaboration:** an unrelated streaming reply no longer disables the composer. You can assign the next task to another agent or room immediately, while each Soul still receives ordered turns.
- **Android streaming and reasoning toggle:** Android now renders SSE response chunks as they arrive. Settings can reveal only `reasoning/thinking` fields explicitly supplied by a compatible server; they are hidden by default and never fabricated.
- **Reliable mentions and delegation:** routing uses exact aliases or connection IDs with token boundaries, supports multi-word aliases such as `@Project Manager`, and avoids prefix collisions such as `@Ann` versus `@Anna`.
- **Goal-oriented iterations:** the lead agent works from a plan, acceptance criteria, constrained delegation, and review rounds, then surfaces a continue/done/blocked result for the user.

---

## What Is New In v0.22.1

- Room-list management now expands in place on the Rooms page instead of jumping back into the old chat details/tools surface
- The mobile chat picker no longer has a duplicate inline Adjust flow; it routes to the single Rooms-page management center
- The room management center now keeps room name, context budget, room mode, default collaboration mode, delegation depth, member enablement, aliases, avatars, add, and remove controls together
- The chat tools surface is now framed as collaboration tools and links to room management for foundational room settings

---

## What Is New In v0.22.0

- Added the `laphiny-room-state` Agent-to-room interface for writing stable knowledge, blackboard items, decisions, and resolved items back into the room growth layer
- Goal mode prompts now explicitly read the room growth layer and require the lead agent to emit state patches when the goal advances
- Shared group history prompts now show how many visible history items are injected and direct agents to older room memory/growth context when history is clipped
- Fixed 120-second request timeouts being mislabeled as manual stops; goal requests now allow up to 240 seconds, regular chat up to 180 seconds
- Diagnostic finding: the novel-writing room had 52 messages while chat requests showed only 2/3 prompt messages because shared history is packed into one prompt message; the new prompt text makes this explicit and improves continuity

---

## What Is New In v0.20.0

- Added the room growth layer: knowledge base, collaboration blackboard, decision records, and growth stage summaries
- Room memory generation now follows a draft -> user confirmation -> sediment flow instead of writing directly into long-term context
- Confirmed memory automatically feeds stable goals/preferences into knowledge, todos/questions into the blackboard, and decisions into decision records
- Chat prompts now include the room growth layer, giving agents more stable room facts and boundaries after several collaboration rounds
- The room tools panel now includes a room-specific Soul relation graph for delegation, completion, and citation relationships
- Product positioning now clarifies that the user is the room convener, relationship steward, and final decision maker; agent growth happens in the shared room layer, not by overwriting private souls
- The PR review workflow avoids retrying permanent 4xx errors for the full retry window

---

## What Is New In v0.14.1

- Attachment cards now open a preview surface first; file name, type, size, and the upper-right download action are kept visible
- Android download directory selection is persisted and reused for attachments, backups, and diagnostics JSON exports
- Feedback logs are upload-only by default; the feedback server no longer exposes the log list endpoint
- Diagnostics export now writes a redacted JSON file instead of copying JSON to the clipboard
- Project info now includes a GitHub author summary and small-screen UI polish

---

## What Is New In v0.14.0

- Mobile chat picker cards can expand inline to edit room name, mode, context limit, member enabled state, and Agent avatars
- Agent replies that use `filename: note.txt` plus a text code block now become downloadable attachment cards
- Added dark mode, system / LXGW WenKai font selection, and personalization entry points
- Added redacted feedback log upload and server log pull, backed by `scripts/feedback-server.mjs`
- Tuned the PR review workflow with a smaller diff payload, longer Hermes request timeout, and retries
- Added `docs/PRODUCT_STRATEGY.md` and `docs/PRODUCT_STRATEGY.zh-CN.md` for product cleanup, missing capabilities, and differentiation

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
- `src/lib/room_growth.ts`: room knowledge, blackboard, decisions, and growth-layer prompt formatting
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

The current suite contains 132 tests covering proactive-message recovery, SSE parsing, stream events, permission continuation, delegation boundaries, scheduler isolation, Goal transitions, long-history paging, and index repair.

---

## Build And Release

### Web / PWA

Always build web assets with:

```bash
npm run web:build
```

To rebuild, start a local production preview, and open it in the browser in one step, run:

```bash
npm run web:preview
```

On Windows, you can also double-click `打开Web预览.cmd` in the repository root. The preview opens `http://127.0.0.1:8080/laphiny/` by default, automatically tries following ports when needed, and prints the actual URL. Press `Ctrl+C` to stop it.

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

The production sync backend is now a separate `laphiny-sync` project that users can deploy on their own server with Docker Compose. In addition to remote snapshots, it issues least-privilege “room × Agent” reply bindings. A scheduled Agent task can therefore deliver its result after the original chat request has already ended.

```bash
git clone https://github.com/Lovely-Laper/laphiny-sync.git
cd laphiny-sync
sh scripts/install.sh
```

While active, Laphiny receives proactive messages over SSE, performs a recovery pull every 15 seconds, and immediately recovers after startup or foreground resume. A message is committed to server-side SQLite and local chat history before its cursor is acknowledged, so reconnects and retries neither lose nor duplicate it.

Main endpoints:

- `GET /v1/health`
- `GET /v1/snapshot`
- `PUT /v1/snapshot`
- `GET /v1/events`
- `POST /v1/events`
- `POST /v1/agent-bindings`
- `POST /v1/agent/messages`
- `GET /v1/agent/messages?after=<cursor>`
- `GET /v1/agent/stream?after=<cursor>`
- `POST /v1/agent/acks`

The Settings tab can create and copy a delivery configuration for an exact room member and revoke it later. Production deployments must use HTTPS and protect both `.env` and the SQLite volume; a complete snapshot may contain Hermes API keys.

The repository-local `npm run sync:server` remains only as a legacy-compatible development reference. New deployments should use the standalone project.

---

## Feedback Server

The feedback server is an optional lightweight Node.js service. It receives redacted diagnostic bundles from the app and lets the app pull recent feedback logs back from the server.

```bash
LAPHINY_FEEDBACK_API_KEY='your-secret' LAPHINY_FEEDBACK_PORT=8788 npm run feedback:server
```

Endpoints:

- `GET /v1/health`
- `POST /v1/feedback`
- `GET /v1/feedback?limit=30`

For production, run it under systemd and expose it through HTTPS reverse proxy. The repository does not ship with any private feedback server URL or API key.

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
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)
- [Ionicons](https://ionic.io/ionicons)

Contributions are welcome. Before opening a PR:

1. Run `npm run typecheck`, `npm test`, and `npm run web:build`
2. Do not commit real API keys, Gateway URLs, or private connection backups
3. For group chat, delegation, or collaboration behavior, prefer updating `src/app/chat_history.ts` and testable `src/lib/*` modules
