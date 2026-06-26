# 08. 维护性重构说明

这一轮重构的目标是让 Laphiny 从“单文件快速迭代原型”进入“可长期维护工程”。原则是：**先拆低风险公共层，不改变业务行为；再逐步拆 screen / hook。**

## 已完成拆分

### `src/app/app_types.ts`

放置 App 层 UI/运行时类型，例如：

- `Tab`
- `ConnectionHealth`
- `ScheduledReply`
- `SendTargetSelection`
- `LaphinyBackup`
- `PWAInstallPromptEvent`

这些类型不是 Hermes domain 本身的一部分，而是 App 页面编排、运行态和 UI 状态需要的类型。

### `src/config/app_config.ts`

放置应用常量和默认配置，例如：

- `DEFAULT_MODEL`
- `DEFAULT_CONTEXT_LIMIT`
- `MAX_DELEGATION_DEPTH`
- `APP_VERSION`
- `QUICK_COMMANDS`
- `STATUS_LABELS`
- `makeDefaultConnections()`

以后默认连接、默认上下文长度、快捷指令等不应该散落在 `App.tsx` 中。

### `src/app/chat_history.ts`

放置 Hermes 请求上下文构造逻辑，例如：

- `buildChatHistory()`
- `buildChatHistoryForSequentialTurn()`
- `buildChatHistoryForDelegation()`
- `buildSummaryMessages()`
- `buildGroupSystemPrompt()`
- `buildSharedGroupHistoryMessage()`

这是多 Agent 协作最核心的上下文层。以后修“Agent 是否能看到共享记录”“委托提示词如何构造”“RP 档案如何注入”时，优先看这个文件。

### `src/app/app_utils.ts`

放置 App 层通用工具，例如：

- id 生成：`makeId()`
- 消息工厂：`makeRoom()`、`makeAssistantPlaceholder()`、`makeLocalNotice()`
- 格式化：`formatTime()`、`formatBytes()`、`buildMarkdownExport()`
- 同步合并：`mergeByUpdatedAt()`、`mergeMessagesByRoom()`
- 备份恢复：`normalizeBackupSnapshot()`
- 平台提示：`showNotice()`、`requestConfirm()`

这些函数原本混在 `App.tsx` 尾部，现在集中维护。

### `src/components/SafeIcon.tsx`

放置无字体依赖的安全文本图标。

这是为了解决部分 Web / Android 环境中图标字体无法加载，显示为“长方形里一个叉”的问题。当前 UI 不再依赖 `@expo/vector-icons` 渲染图标字形。

### `src/components/Primitives.tsx`

放置基础 UI 组件，例如：

- `TabButton`
- `PrimaryButton`
- `SecondaryButton`
- `IconButton`
- `MiniButton`
- `AttachmentPreview`
- `AgentAvatar`
- `AgentBadge`
- `StatusToken`
- `HealthBadge`
- `ConnectionProfileCard`
- `EmptyState`

这些组件可以继续被 screen 复用。

### `src/components/MarkdownText.tsx`

放置轻量 Markdown 渲染器，支持：

- 标题
- 列表
- 引用
- 代码块
- 行内代码
- 加粗
- Markdown 表格

以后如果要替换为完整 Markdown 库，可以从这个组件开始替换。

## 当前 `App.tsx` 仍然负责什么

`App.tsx` 目前仍然负责：

- 全局状态管理
- 数据加载与保存
- Hermes 请求调度
- 协作/委托运行流程
- tab 页面 render 函数
- Web/PWA 状态
- 同步/备份/恢复入口

它已经从约 7400 行降到约 6200 行，但仍然偏大。

## 下一步建议拆分

下一步不要继续横向加功能，建议拆 screen 和 hook：

```text
src/screens/ChatScreen.tsx
src/screens/ConnectionsScreen.tsx
src/screens/RoomsScreen.tsx
src/screens/SoulAtriumScreen.tsx

src/components/chat/MessageBubble.tsx
src/components/chat/RoomStatusBar.tsx
src/components/chat/Composer.tsx
src/components/collaboration/TaskBoard.tsx
src/components/roleplay/RoleplayPanel.tsx
src/components/sync/SyncPanel.tsx

src/hooks/useConnections.ts
src/hooks/useRooms.ts
src/hooks/useMessages.ts
src/hooks/useHermesDispatch.ts
src/hooks/useSync.ts
src/hooks/usePwaRuntime.ts
```

拆 screen/hook 时建议按“只搬 UI，先不搬状态”的方式进行：先把 render 函数变成组件，并把所需 props 传进去；稳定后再把状态和动作下沉成 hooks。

## 维护约定

1. Hermes 请求上下文只放在 `src/app/chat_history.ts` 或更专门的 `src/lib/*` 中。
2. 基础按钮、徽章、图标、Markdown 不要再写回 `App.tsx`。
3. 新增 App 层类型优先放 `src/app/app_types.ts`。
4. 新增全局默认值优先放 `src/config/app_config.ts`。
5. 只有跨平台 UI 组件才放 `src/components`。
6. 每次拆分后至少跑：

```bash
npm test
npm run typecheck
npm run web:build
```

在没有完整依赖的环境里，至少跑：

```bash
node --check scripts/sync-server.mjs
npx tsx tests/*.test.ts
npx esbuild App.tsx --bundle --platform=browser --outfile=/tmp/laphiny-check.js \
  --external:react --external:react-native --external:expo-status-bar \
  --external:expo-document-picker --external:expo-file-system/legacy \
  --external:expo-clipboard --external:react-native-url-polyfill/auto \
  --external:expo-image-picker --external:expo-secure-store
```
