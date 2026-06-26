# 特色与未来方向

## 项目特色

### 1. Soul-native，而不是 Prompt-native

普通多 Agent 客户端常常是在客户端里创建 prompt 角色。Laphiny 的定位不同：Agent 本来就存在，拥有自己的 Hermes soul、人格和记忆。Laphiny 只是把它们带进同一个房间。

### 2. 房间共享上下文，而不是共享人格

每个 Agent 保持自己；Laphiny 提供共享 transcript、房间记忆和协作协议。这样既能协作，又不把多个 Agent 混成一个人格。

### 3. @ 是协作路由

在 Laphiny 中，@ 不只是提醒：

- 用户 @ Agent：指定谁响应。
- `@all`：并行观点。
- `@all-seq`：接力协作。
- Agent 行首 @ Agent：创建委托任务。

### 4. Agent 自维护协作卡片

用户不需要手写每个 Agent 擅长什么。Laphiny 可以询问 Agent 自己，让它生成公开协作卡片。其他 Agent 根据公开卡片判断是否委托。

### 5. 工作与娱乐共存

Laphiny 有两条路线：

- 专业路线：议会、红队、审查、复盘、任务看板、共识总结。
- 娱乐路线：桌游店 RP、GM、NPC、剧本档案、场景、OOC。

### 6. 灵庭

灵庭不是简单日志页，而是 Soul 小队活动中庭：今日动态、任务、关系图、协作事件、诊断、同步和备份都在这里汇总。

## 近期优化方向

### 1. UI 组件拆分

当前 `App.tsx` 过大。建议拆分：

- `src/screens/ChatScreen.tsx`
- `src/screens/ConnectionsScreen.tsx`
- `src/screens/RoomsScreen.tsx`
- `src/screens/SoulAtriumScreen.tsx`
- `src/components/MessageBubble.tsx`
- `src/components/RoomStatusBar.tsx`
- `src/components/TaskBoard.tsx`
- `src/components/RoleplayPanel.tsx`

这样后续维护会更轻松。

### 2. 状态管理抽离

目前大量状态在 `App.tsx`。可以逐步抽离为 hooks：

- `useConnections`
- `useRooms`
- `useMessages`
- `useCollaboration`
- `useSync`
- `useDiagnostics`

### 3. 更专业的本地数据库

现在 Native 长期记录使用 JSON 文件。随着消息增长，可以升级到 SQLite 分片和索引：

- messages 表。
- attachments 表。
- full-text search。
- 按 room 分页加载。

### 4. RP 深度增强

- 角色卡。
- 关系值。
- 骰子 / 判定系统。
- 幕后 GM 线索只给 GM 看。
- 剧情分支树。
- 章节结算。

### 5. 任务系统增强

- 手动创建任务。
- 任务截止时间。
- 任务依赖。
- 任务评论。
- 任务转房间记忆。
- 专业任务 / RP 任务统一看板。

### 6. Soul 关系与路由优化

- 根据委托成功率推荐目标 Agent。
- 根据任务类型自动选择首发 Agent。
- 自动选择总结者。
- 识别重复发言和低效委托。

### 7. 模板生态

可导出 / 导入：

- 团队模板。
- 房间模板。
- RP 世界观模板。
- 审查流程模板。

模板不应包含 API Key。

### 8. 部署产品化

- `.env.example`。
- Dockerfile / docker-compose。
- nginx 示例配置。
- 首次启动配置向导。
- 健康检查页面。

## 长期愿景

Laphiny 可以发展成一个私人 Soul Room 系统：

- 用户拥有一组长期存在的 Agent。
- Agent 有自己的 soul、记忆、能力边界和协作卡片。
- 房间有自己的目标、历史、记忆、任务、关系和氛围。
- 灵庭记录 Soul 小队的活动、成长和关系。
- 专业任务与角色扮演都可以在同一套协作机制上运行。
