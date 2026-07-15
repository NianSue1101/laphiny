# Laphiny Product Strategy

## Current Product Definition

Laphiny is a local-first collaboration client for multiple Hermes agents. Its strongest direction is not "one assistant answers one user", but "persistent agents with public personas, rooms, delegation, rituals, memory capsules, and roleplay/work modes share a living workspace with the user".

## Features That May Be Too Heavy

- The standalone room management page is useful for desktop and bulk edits, but on mobile it should not be the primary path. The chat picker now owns quick room adjustment so the user does not bounce back to an old management flow.
- Multiple collaboration surfaces can overlap: square events, diagnostic logs, room summaries, memory capsules, and delegation archives all describe "what happened". They should remain separate only when each has a clear job: diagnostics for failures, square for ambient activity, memory for durable decisions, archive for handoff.
- Advanced roleplay controls should stay discoverable but not dominate the default chat flow. Laphiny's everyday experience should still feel like a fast collaboration room.

## Missing Near-Term Capabilities

- A first-run "connect Hermes" path that can validate endpoint/model/session behavior before the user creates rooms.
- A compact mobile room editor for the most common actions: rename, member enable/disable, mode, context limit, and avatars. This is now started in the chat picker and should be expanded cautiously.
- A feedback loop that can upload redacted diagnostics and retrieve them from the server without SSH. This is implemented as a lightweight feedback service.
- Attachment contracts for agent-generated files. Agents can now emit simple filename plus code block text, but the app should document the preferred `laphiny-file` format in the UI and prompts.
- A privacy dashboard showing exactly what is local, what can be backed up, what can sync, and what can be uploaded for feedback.

## Iteration After v0.32

The next releases should deepen the ability to execute one goal reliably instead of adding more disconnected surfaces. Every milestone should use the same loop: define a verifiable goal, create a bounded plan, delegate to an exact agent, collect structured evidence, review the remaining gap, adjust, and notify the user only after acceptance or a safe stop.

1. **v0.33 — observability and recovery.** Turn stream events and Goal reviews into an exportable local audit timeline; add a real task-queue view, failure categories, step-level retry, and Android lifecycle tests for backgrounding and process death.
2. **v0.34 — editability and control.** Let users edit acceptance criteria, dependencies, owners, round/budget limits, and pause points in the Goal panel. Add delegation cancellation, reassignment, manual takeover, and permission boundaries.
3. **v0.35 — stronger room memory.** Sediment only accepted evidence and decisions into the room growth layer, with provenance, conflict warnings, expiry checks, and user confirmation so that a summary never automatically becomes a fact.
4. **v0.36 — multi-device consistency.** Version message pages, Goal state, delegations, and event streams with an idempotent merge protocol; solve offline reconnect and conflict behavior before expanding hosted services.
5. **Continuous quality gates.** Keep regression coverage for 50,000-message rooms, duplicate aliases, concurrent rooms, cancellation/retry, no-progress goals, and Android lifecycle changes. UX changes should be justified by latency, memory, error-rate, or completion-rate evidence.

Prioritization follows three rules: prevent data loss and false completion first, reduce waiting and manual coordination second, and add new rituals or presentation surfaces last.

## Differentiation

Most adjacent products optimize for single-agent chat, prompt libraries, generic workflows, or hosted team automation. Laphiny can win by becoming the best client for "agent society with human direction":

- Soul-native identity: agents keep public collaboration cards, avatars, names, roles, and durable room relationships instead of being temporary prompt slots.
- Room memory as a first-class artifact: decisions, unresolved questions, preferences, and handoff notes belong to a room and can guide future rounds.
- Delegation as conversation, not hidden automation: agents can ask each other for work, report status, request permission, and leave an audit trail the user can read.
- Hybrid work and roleplay: the same room primitives support code review councils, red-team reviews, retrospectives, and long-form RP with a GM.
- Local-first trust: API keys, rooms, and backups are under user control; cloud sync and feedback are explicit opt-in layers.

## Leading Unique Feature Bet

The strongest bet is "persistent agent rooms with explicit social memory". The product should make each agent feel like a recurring collaborator with public behavior, not a disposable completion endpoint. The defensible advantage comes from combining:

- fast mobile-first room switching,
- visible inter-agent delegation,
- durable memory capsules,
- permission-aware tool requests,
- local-first storage and export,
- and feedback/sync services that users can self-host.

If these pieces keep tightening together, Laphiny becomes less comparable to a chat wrapper and more like a personal agent studio: a place where the user curates a small team of digital collaborators that remember how to work together.
