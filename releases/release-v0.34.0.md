## Laphiny v0.34.0

This release focuses the interface around the active conversation while preserving all existing features.

### Highlights

- Reduced UI density across connections, room tools, mobile details, onboarding, settings, and the composer.
- Chats reopen at the newest message; a compact **Latest** button appears only when at least 20 newer messages remain.
- Agent delegations now appear as inline task sheets with source, assignee, status, task, delivery/acceptance details, errors, and retry controls.
- Delegation-limit, tool-delegation, memory-draft, paused-goal, and RP notices now open focused settings without leaving or moving the chat.
- Ordinary per-reply delegation limits are persisted per room and carried into Agent collaboration prompts and team templates.
- Version metadata is unified at `0.34.0`; Android uses `versionCode 340`.

### Verification

- TypeScript typecheck passed.
- 127 automated tests passed.
- Web production build passed with `/laphiny/` path rewriting, service worker, offline page, bundle, and font assets verified.
- Android Release build passed on JDK 21.
- Android 16 emulator upgrade install and interaction verification passed.
- APK signer SHA-256: `1887df6dc3ba795ff47c622ab6479813c5e89a588b101cc2a37fb2d0e4eeee23`.

### SHA-256

- `laphiny-v0.34.0.apk`: `F7C81ACFA5CDBE63B6ECF97A715ECFA3AE55E0D188296DC2213AAD1A3069CE30`
- `laphiny-v0.34.0-web.zip`: `75E41CF8B3183168E029FF89958988B33B8CDCD11F65C0D98B9D26CA583DAB72`

### Boundaries

- The app does not infer hidden reasoning, unreported plugin versions, tool results, or delegation success.
- Full backups may contain API keys; diagnostic and collaboration reports remain redacted.
