## What changed

- reduce UI density across connections, room tools, mobile room details, onboarding, settings, and the chat composer while preserving every existing capability
- reopen chats at the latest message and show a compact jump-to-latest control only when at least 20 newer messages remain
- render Agent delegations as inline task sheets with status, task, delivery/acceptance details, errors, and retry actions
- attach focused in-chat settings to actionable notices for delegation limits, tool delegation, memory drafts, paused goals, and RP mode
- make the ordinary per-reply delegation limit a persisted room setting and carry it through collaboration prompts and team templates
- bump all release metadata to v0.34.0 / Android versionCode 340 and document the release in Chinese and English

## Review follow-up

- guarantee the collaboration-mode panel closes even when command insertion fails
- close the attachment menu only after the native image or document picker returns
- extract chat visibility/key calculation into `src/lib/chat_view_state.ts` with focused tests
- remove the duplicate delegation-limit fallback from `buildCollaborationProtocol`

## Why

The chat and management surfaces had accumulated too many equally prominent controls. Delegations and remediation actions were also difficult to discover without leaving the active conversation. This release makes primary work visible, discloses secondary controls on demand, and keeps configuration changes inside the chat context.

## Validation

- `npm run typecheck`
- `npm test` — 127 passing
- `npm run web:build`
- production-signed `npm run android:assemble:release`
- Android 16 emulator upgrade install and UI verification
- `/laphiny/` bundle, font, service worker, and offline asset checks
- GitHub `typecheck-and-test` and automated review checks passed on head commit `12ab957f`

## Privacy

No Gateway URL, API key, sync backend, local backup, signing secret, or diagnostic payload is included in the commit.
