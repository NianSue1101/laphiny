# Laphiny 后续优化路线

这份文档记录当前 `App.tsx` 拆分后的下一步工程方向，目标是让后续功能开发不再继续堆进单个入口文件，同时保证现有聊天、同步、备份、诊断和发布流程稳定。

## 当前状态

- `App.tsx` 仍然保留应用级状态、数据加载、持久化、副作用、Hermes 请求调度和页面入口。
- 大块样式已经迁到 `src/app/app_styles.ts`。
- 聊天页、房间页、协作抽屉、房间成长层、目标面板、快捷命令和部分设置页已经拆到 `src/components/*`。
- 设置页正在向 `src/components/settings/*` 收拢，当前包含：
  - `SettingsInfoPanels.tsx`：项目信息、个性化、SQLite 同步后端。
  - `SyncConflictReportPanel.tsx`：同步差异预检展示。
  - `index.ts`：settings 目录导出边界。

## 拆分原则

1. 先拆展示组件，后拆流程逻辑。
2. 组件只接收已经计算好的数据和回调，不直接读写 App state。
3. 同步、备份、诊断、Hermes 调度、消息发送这类多集合写入流程，除非补充测试，否则继续留在 `App.tsx`。
4. 每轮拆分都要跑：
   - `npm run typecheck`
   - `npm test`
   - `npm run web:build`
5. Web 构建后继续确认 `/laphiny/_expo` 和 `/laphiny/assets` 路径。

## 推荐的下一轮拆分

### 1. 设置页数据与日志面板

候选文件：

```text
src/components/settings/SettingsDataPanel.tsx
src/components/settings/DiagnosticLogsPanel.tsx
src/components/settings/FeedbackSettingsPanel.tsx
```

建议先把当前设置页里的“数据、备份与日志”大卡片拆成一个容器组件，再视 props 数量继续拆成备份、反馈、诊断三个子面板。不要把 `exportAppBackup`、`importBackupFile`、`uploadFeedbackLogs`、`exportDiagnosticBundle` 这些流程实现搬进组件，先通过回调传入。

### 2. 灵庭页展示面板

候选文件：

```text
src/components/square/SoulDailyPanel.tsx
src/components/square/CollaborationArchivePanel.tsx
src/components/square/SquareEventList.tsx
```

这些面板主要展示 `squareEvents`、`collaborationEvents`、`delegationTasks` 和派生摘要，适合从 `App.tsx` 迁出。迁出时保留 `buildSoulDailyDigest` 等纯计算在 `src/lib` 或 `src/app`，组件只负责渲染。

### 3. 聊天消息气泡

候选文件：

```text
src/components/chat/MessageBubble.tsx
src/components/chat/AgentPermissionPanel.tsx
```

这是中等风险拆分，因为消息气泡依赖附件、复制、停止、重试、权限请求、Markdown 渲染和头像。拆之前建议先补一个针对 `getRenderableMessageArtifacts` 或权限面板的单元测试，确保 Agent 文件提取和权限请求入口不丢。

### 4. 房间工具面板

候选文件：

```text
src/components/rooms/RoomToolsPanel.tsx
src/components/rooms/RoomRoleplaySettingsPanel.tsx
src/components/rooms/RoomMemoryPanel.tsx
```

这里包含 RP、记忆胶囊、模板、成员、导出/清空等操作。拆分时必须继续保持房间基础设置的唯一主入口：`RoomManagementPanel`。

## 功能开发方向

### 近期优先

- 新手连接向导：把 Hermes endpoint、model、API key、健康检查、首个房间创建串成一步步流程。
- 隐私状态面板：明确哪些数据只在本地、哪些会进入备份、哪些会同步、哪些会作为脱敏反馈上传。
- 诊断包体验：导出前给出脱敏摘要和风险提示，便于用户判断能否分享。
- 同步冲突处理：从“只读预检”扩展到可选择的冲突处理策略，例如先备份、只拉远端独有、只推本地较新。

### 中期能力

- Agent 文件产物中心：统一展示 `laphiny-file`、代码块附件、图片附件，并支持按房间归档。
- 房间记忆版本历史：允许查看、比较和回滚记忆胶囊，避免长房间被一次错误总结污染。
- 委托任务详情页：把开放委托、运行中委托、完成记录从侧栏摘要扩展成可审计视图。
- 移动端房间快捷编辑：补齐 alias、总结者、自动委托深度等轻量设置，但不要复制完整房间管理表单。

### 长期方向

- Soul-native agent studio：围绕稳定 Agent 身份、房间关系、长期记忆和可见委托，形成区别于普通聊天壳的核心体验。
- 可托管同步与反馈闭环：让用户可以自托管同步/反馈服务，并在客户端直接看到同步状态和反馈处理结果。
- RP 与工作流共用房间原语：保持 RP、红队评审、复盘、协作会议使用同一套成员、记忆、委托和档案模型。

## 文件组织建议

推荐逐步形成以下目录边界：

```text
src/app/
  app_styles.ts
  app_status_labels.ts
  app_utils.ts
  chat_history.ts

src/components/chat/
src/components/rooms/
src/components/settings/
src/components/square/

src/lib/
  纯逻辑、解析、提示词构造、同步比较和 Hermes 客户端

src/storage/
  本地持久化与平台存储适配
```

不要急着一次性搬目录。每次只迁移一类 UI，并保持 import 边界清楚；组件目录内部可以用 `index.ts` 汇总导出，但避免跨目录互相依赖 App 私有状态。

## 验收清单

- `App.tsx` 行数继续下降，但仍保留顶层编排职责。
- 新组件能通过 props 独立理解输入输出。
- 没有新增第二套房间管理入口。
- 没有把 API key、同步地址、release secret 或本地备份提交进仓库。
- Web 和 Android 发布流程仍按 `AGENTS.md` 执行。
