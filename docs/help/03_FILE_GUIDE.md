# 文件结构说明

## 根目录

| 文件 | 作用 |
| --- | --- |
| `App.tsx` | 主应用入口，包含主要 UI、状态管理、发送调度、房间工具、灵庭和设置页。 |
| `index.ts` | Expo 入口注册。 |
| `package.json` | 依赖与脚本。重要脚本：`npm run web:build`、`npm test`、`npm run sync:server`。 |
| `app.json` | Expo 配置，包含 Web/PWA/Android 基础配置和 EAS project id。 |
| `eas.json` | EAS 构建配置。 |
| `AGENTS.md` | 项目协作守则，特别强调 Web 构建命令和隐私要求。 |
| `HELP.md` | 帮助文档入口。 |

## `src/types.ts`

集中定义项目核心类型：

- `HermesConnection`
- `Room`
- `RoomMember`
- `ChatMessage`
- `Attachment`
- `AgentProfile`
- `RoomMemoryCapsule`
- `RoleplayConfig`
- `RoleplayArchive`
- `CollaborationEvent`
- `DelegationTask`
- `TeamTemplate`
- `SyncSnapshot`

修改数据结构时应优先更新这里，并同步更新存储、同步服务和备份恢复逻辑。

## `src/lib`

| 文件 | 作用 |
| --- | --- |
| `hermes_client.ts` | Hermes API client，封装 health、models、chat completion、SSE stream。 |
| `mentions.ts` | 用户 @ 和 Agent 委托 @ 的解析。 |
| `payload.ts` | 将文本、图片、附件组装为 Hermes Chat payload。 |
| `attachments.ts` | 图片 / 文件选择和文本文件读取。 |
| `agent_profile.ts` | 协作卡片生成提示词、JSON 解析、格式化。 |
| `collaboration_rituals.ts` | `/council`、`/redteam`、`/review`、`/retro`。 |
| `roleplay.ts` | RP 模式命令解析、RP 目标选择、RP system prompt。 |
| `room_memory.ts` | 房间记忆胶囊的生成、解析、格式化和注入。 |
| `room_reply_notifications.ts` | 跨房间 Agent 回复提醒的纯逻辑。 |
| `square_insights.ts` | 灵庭今日小队动态统计。 |
| `stage4_plus.ts` | 房间模式、RP 剧本档案、任务看板、Soul 关系图、启动向导、模板。 |
| `diagnostics.ts` | 诊断日志、脱敏诊断包。 |
| `sync_client.ts` | 前端访问 SQLite 同步服务的 client。 |
| `sync_conflicts.ts` | 本地 / 远端快照差异预检。 |
| `ux.ts` | slash command 补全与 UX 命令定义。 |

## `src/storage`

| 文件 | 作用 |
| --- | --- |
| `kv.ts` | 跨平台 key-value 存储。Web 用 localStorage；Native 密钥用 SecureStore，长期记录用文件系统。 |
| `repository.ts` | 连接、房间、消息、灵庭事件、诊断日志、任务等数据的 load/save 封装。 |

## `scripts`

| 文件 | 作用 |
| --- | --- |
| `sync-server.mjs` | Node + SQLite 同步服务，提供 `/v1/health`、`/v1/snapshot`、`/v1/events` 等接口。 |
| `fix-web-paths.mjs` | 修正 Web 构建产物在 `/laphiny/` 子路径部署时的资源路径。 |
| `run-gradle.mjs` | 跨平台调用 Android Gradle wrapper。 |

## `public`

| 文件 | 作用 |
| --- | --- |
| `sw.js` | Web/PWA service worker。 |
| `offline.html` | 离线兜底页。 |

## `tests`

覆盖核心纯逻辑：

- @ 解析
- payload 构造
- 协作卡片解析
- 诊断脱敏
- 同步差异
- 同步服务
- 协作仪式
- 房间记忆
- RP
- UX 命令
- Stage 4 Plus 工具
- 跨房间回复提醒

## App 层拆分

### `src/app/`

服务于前端页面运行：

- `app_types.ts`：tab、表单、运行时、备份、PWA、健康状态等 App 层类型。
- `app_utils.ts`：id、时间、导出、合并、备份恢复、消息工厂、平台提示等通用工具。
- `chat_history.ts`：构造发给 Hermes 的 messages / system prompt / 共享群聊 transcript / 委托上下文。

### `src/config/`

- `app_config.ts`：默认模型、上下文长度、最大委托深度、快捷命令、状态标签。

正式版不会内置私人 Hermes 连接或 API Key。

### `src/components/`

可复用 UI 组件：

- `SafeIcon.tsx`：Ionicons 包装层，集中处理图标入口。
- `Primitives.tsx`：按钮、徽章、头像、附件预览、健康状态、空状态等基础组件。
- `MarkdownText.tsx`：轻量 Markdown 渲染。
