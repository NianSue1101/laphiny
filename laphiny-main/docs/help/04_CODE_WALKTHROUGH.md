# 代码功能详解

## App.tsx 总体结构

`App.tsx` 目前承担了主应用的绝大部分状态与 UI。可以理解为几个层次：

1. 全局状态：连接、房间、消息、灵庭事件、诊断日志、同步配置、任务、模板等。
2. 派生状态：当前房间、当前房间消息、搜索结果、任务看板、Soul 关系、今日动态。
3. 发送调度：用户输入进入 `sendMessage` / `dispatchMessage`，再根据 @、房间模式、RP 模式、协作仪式决定 targets。
4. Hermes 请求：调用 `HermesClient.chatCompletionStream` 获取流式回复。
5. 协作后处理：保存消息、生成灵庭事件、诊断日志、解析 Agent 行首 @ 委托、更新任务卡。
6. UI 渲染：聊天页、连接页、房间页、灵庭页，以及各种工具面板。

## 发送流程

### 普通单聊

1. 用户输入消息。
2. 当前房间是 direct。
3. 自动选择唯一启用成员。
4. 构造上下文。
5. 调用 Hermes stream。
6. 保存 assistant 消息。

### 普通群聊

1. 用户输入消息。
2. `resolveMentionTargets` 解析 `@成员名`、`@all`、`@all-seq`。
3. 如果没有 @，根据房间默认协作模式决定是否触发。
4. 并行模式使用多个 target 同时请求。
5. 接力模式按顺序请求，每个后续 Agent 能看到前面 Agent 刚生成的回复。

### Agent 自动委托

1. Agent 回复完成。
2. `resolveAssistantDelegations` 只解析行首 `@成员名 任务`。
3. 创建 `DelegationTask`。
4. 记录协作事件。
5. 若未超过最大委托深度，立即把任务发给目标 Agent。
6. 目标 Agent 完成后更新任务状态。

## 上下文结构

群聊请求一般由以下部分组成：

1. system：房间身份、协作协议、成员公开协作卡片、房间模式提示、RP 附加提示。
2. user：共享群聊历史 transcript，格式类似“说话人：内容”。
3. user：房间记忆胶囊或 RP 剧本档案。
4. user：当前用户输入或委托任务。

重要边界：

- Hermes Soul 自己的长期人格和记忆仍在 Hermes 服务内。
- Laphiny 只注入房间级共享上下文，不覆盖 Agent 的底层 soul。

## @ 解析

`src/lib/mentions.ts` 支持：

- `@Flor`
- `＠Flor`
- `@Flor，帮我看看`
- `@all`
- `@all-seq`

Agent 自动委托只允许行首触发，避免普通提及误触发。

## 协作仪式

`src/lib/collaboration_rituals.ts` 定义四种仪式：

- council：并行观点 + 共识总结。
- redteam：顺序风险审查。
- review：顺序质量审查。
- retro：顺序复盘。

这些仪式通过 slash command 触发，也可由 UI 快捷入口填入命令。

## 房间记忆

`src/lib/room_memory.ts` 负责：

- 构建让 Agent 生成记忆胶囊的 messages。
- 从 Agent JSON 回复解析 `RoomMemoryCapsule`。
- 格式化记忆胶囊，注入后续群聊。

记忆字段包括目标、决策、待办、偏好、未解决问题和交接提示。

## RP 模式

`src/lib/roleplay.ts` 负责：

- `/rp`、`/scene`、`/ooc`、`/rp-stop` 解析。
- 判断普通输入是否应作为 RP 回合。
- 选择 GM 和其他入戏 Agent。
- 为 GM / 非 GM 生成不同 system appendix。

`src/lib/stage4_plus.ts` 负责 RP 剧本档案：世界观、章节、NPC、地点、道具、线索、谜团、选择和 GM 幕后笔记。

## 灵庭

灵庭是全局面板，展示：

- 今日小队动态。
- 诊断日志。
- 同步状态。
- 备份恢复。
- 协作事件流。
- 任务看板。
- 团队模板。
- 协作卡片版本。
- RP 档案。
- Soul 关系图。

## 同步服务

`scripts/sync-server.mjs` 使用 Node 内置 SQLite，核心函数：

- `openDatabase`
- `migrate`
- `createApp`
- `mergeSnapshot`
- `readSnapshot`

同步策略是快照合并。连接、房间、消息、灵庭事件有表结构；协作事件、任务、模板和卡片版本放在 `extra_state`。

## 诊断

`src/lib/diagnostics.ts` 会生成最近 200 条诊断日志，并支持生成脱敏诊断包。诊断包会移除 API Key、Bearer token、URL query secret 等敏感内容。
