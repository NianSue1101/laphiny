# Laphiny

> 把已有的 Hermes Soul / Agent 放进同一个房间，让它们保留各自人格与记忆，通过共享上下文、@ 委托、接力讨论、房间记忆、任务看板和协作仪式，像一支真正的 AI 小队那样共同工作。

Laphiny 是一个面向多 Hermes Agent 的本地优先协作聊天客户端，支持 **Web/PWA** 与 **Android APK**。

它不是普通的"多模型聊天壳"。每个 Agent 都已经拥有自己的 Hermes soul、人格和长期记忆；Laphiny 只提供房间、共享 transcript 和协作协议，不覆盖 Agent 的底层灵魂。

---

## 目录

- [立项的意义](#立项的意义)
- [文件结构说明](#文件结构说明)
- [已完成功能](#已完成功能)
- [待完成功能](#待完成功能)
- [部署帮助](#部署帮助)
- [贡献鸣谢](#贡献鸣谢)

---

## 立项的意义

### 问题

今天我们有多个强大的 AI Agent（Hermes Soul），每个都有自己的专业领域、人格和记忆。但当我们想让它们一起工作时，通常只能靠人工复制粘贴对话片段——效率低下、上下文丢失、无法追溯。

现有"多模型聊天客户端"把 Agent 当作可切换的模型选项，而不是独立协作成员。它们缺少：

- 多人共享的群聊上下文
- Agent 之间的自动委托与接力
- 结构化的协作仪式（议会、红队、审查、复盘）
- 房间级别的长期记忆与共识沉淀
- Agent 自维护的公开协作卡片

### 定位

Laphiny 的核心设计理念是 **Soul-native，而不是 Prompt-native**：

| 传统多 Agent 客户端 | Laphiny |
|---|---|
| 在客户端里临时创建角色 prompt | Agent 已存在，有自己的 soul、人格和记忆 |
| 模型切换 | Agent 协作 |
| 对话记录混在一起 | 每个 Agent 独立维护自己的人格 |
| 无结构化协作流程 | `/council` `/redteam` `/review` `/retro` |
| 无长期房间记忆 | 房间记忆胶囊、共识总结、任务看板 |

### 适合谁

- **开发者 / 技术团队**：让多个 Agent 审查代码、评审方案、拆解需求、分析风险
- **创作者 / 写作者**：让多个 Agent 接力写作、角色扮演、世界观共创
- **任何想建设私人 AI 小队的人**：把自己的 Agent 放进同一个房间，让它们真正协作

---

## 文件结构说明

```
laphiny/
├── App.tsx                  # 主应用入口（UI、状态、调度、房间、灵庭、设置）
├── index.ts                 # Expo 入口注册
├── package.json             # 依赖与脚本
├── app.json                 # Expo / PWA / Android 配置
├── eas.json                 # EAS 云构建配置
├── tsconfig.json            # TypeScript 严格模式配置
│
├── src/
│   ├── types.ts             # 核心类型定义（Connection、Room、Message 等）
│   ├── app/                 # App 层逻辑
│   │   ├── app_types.ts     # Tab、表单、运行时、备份等 App 层类型
│   │   ├── app_utils.ts     # ID、时间、导入导出、合并恢复、消息工厂
│   │   └── chat_history.ts  # 构造发给 Hermes 的 messages / system prompt / 群聊 transcript
│   ├── lib/                 # 纯逻辑模块（可测试、无 UI 依赖）
│   │   ├── hermes_client.ts           # Hermes API 客户端（health/models/chat/SSE）
│   │   ├── mentions.ts                # @ 路由与 Agent 委托解析
│   │   ├── payload.ts                 # 文本/图片/附件组装为 Hermes 请求体
│   │   ├── attachments.ts             # 图片/文件选择与读取
│   │   ├── agent_profile.ts           # Agent 协作卡片生成、解析、格式化
│   │   ├── collaboration_rituals.ts   # /council /redteam /review /retro
│   │   ├── roleplay.ts                # RP 命令解析、GM 路由、system prompt
│   │   ├── room_memory.ts             # 房间记忆胶囊
│   │   ├── room_reply_notifications.ts # 跨房间 Agent 回复提醒
│   │   ├── square_insights.ts         # 灵庭小队动态统计
│   │   ├── stage4_plus.ts             # 房间模式、剧本档案、任务看板、Soul 关系图
│   │   ├── diagnostics.ts             # 诊断日志与脱敏
│   │   ├── sync_client.ts             # 同步服务前端客户端
│   │   ├── sync_conflicts.ts          # 本地/远端差异预检
│   │   └── ux.ts                      # Slash command 补全与 UX 定义
│   ├── storage/             # 存储抽象层
│   │   ├── kv.ts            # 跨平台 KV（Web localStorage / Native SecureStore+文件）
│   │   └── repository.ts    # 连接/房间/消息/事件/任务 的 load/save
│   ├── config/
│   │   └── app_config.ts    # 默认模型、上下文长度、最大委托深度、快捷命令
│   └── components/          # 可复用 UI 组件
│       ├── Primitives.tsx   # 按钮、徽章、头像、空状态等
│       ├── SafeIcon.tsx     # Ionicons 包装
│       └── MarkdownText.tsx # 轻量 Markdown 渲染
│
├── scripts/
│   ├── sync-server.mjs      # Node + SQLite 同步服务（/v1/snapshot、/v1/events）
│   ├── fix-web-paths.mjs    # 修正 Web 构建产物在 /laphiny/ 子路径的资源路径
│   └── run-gradle.mjs       # 跨平台 Gradle wrapper 调用
│
├── public/
│   ├── sw.js                # PWA Service Worker
│   └── offline.html         # 离线兜底页
│
├── android/                 # Android 原生工程（Expo prebuild 生成）
├── tests/                   # 测试文件（42 tests，覆盖所有 lib/ 纯逻辑模块）
├── docs/                    # 帮助文档与设计文档
│   ├── PLAN.md              # 实现计划
│   ├── STAGE4_SOUL_COLLABORATION.md
│   └── help/                # 01~08 系列帮助文档
└── dist/                    # Web 构建产物（npm run web:build）
```

---

## 已完成功能

### 连接管理
- 添加 / 编辑 / 删除 Hermes Gateway 连接
- 单个连接测试 / 批量健康检查
- Agent 自维护公开协作卡片（soulName、擅长领域、适合/不适合委托）
- 协作卡片版本历史

### 房间
- 单聊 / 群聊房间
- 房间重命名、成员增删、alias 修改、成员启用/停用
- 上下文条数调整、房间模式切换（工作室/议会/审查/桌游/日常）
- 房间导出 JSON / Markdown、清空记录与会话记忆

### 聊天
- Hermes SSE 流式回复、停止生成、失败重试
- 图片上传（`image_url` content part）、文本文件注入 `<attachment>` 上下文
- 消息状态展示（pending/running/sent/error）

### @ 路由与委托
- `@成员名` 指定响应 Agent
- `@all` 并行调用所有成员、`@all-seq` 接力调用
- 中文全角 `＠` 支持
- Agent 行首 `@成员名 任务` 自动创建委托任务并转发
- 委托质量门槛（过滤空 @、泛泛指令）
- 最大委托深度限制，防止循环委托
- 无 @ 的群聊消息默认不自动发送

### 协作仪式
- `/council` 议会模式：多 Agent 独立观点 → 总结共识
- `/redteam` 红队审查：找漏洞、风险、失败场景、修正方案
- `/review` 审查模式：多视角审查方案/代码/交付物
- `/retro` 复盘模式：总结进展、问题、贡献、下一步

### 房间记忆与任务
- 房间记忆胶囊（目标、决策、待办、偏好、未解决问题）
- 任务看板（待处理/处理中/已完成/阻塞）
- 团队模板（成员顺序、默认模式、委托设置）
- 共识总结生成

### RP 桌游店模式
- GM/主持人 Agent、玩家称呼
- 类型、基调、世界观、当前场景
- `/rp`、`/scene`、`/ooc`、`/rp-stop` 命令
- 剧本档案、GM 幕后笔记

### 灵庭 (Soul Atrium)
- 今日小队动态、任务统计、Soul 关系图
- 协作事件时间线
- 诊断日志与脱敏诊断包

### 数据管理
- 全局搜索
- 全量备份 / 合并恢复
- SQLite 同步服务（快照推送/拉取、差异预检、事件轮询）
- PWA 离线支持

### 跨平台
- Web/PWA（三栏宽屏布局）
- Android APK（本地 Gradle 构建 + EAS 云构建）
- Web localStorage / Native SecureStore + 文件系统

---

## 待完成功能

### 近期优化
- [ ] **UI 组件拆分**：`App.tsx` 过大，拆分为独立 Screen 和 Component 文件
- [ ] **状态管理抽离**：`useConnections`、`useRooms`、`useMessages` 等 hooks
- [ ] **本地 SQLite 升级**：消息分片、全文搜索、按 room 分页
- [ ] **委托质量分析**：识别重复发言和低效委托，根据成功率推荐目标 Agent

### 任务系统增强
- [ ] 手动创建任务
- [ ] 任务截止时间、依赖、评论
- [ ] 任务转房间记忆

### RP 深度增强
- [ ] 角色卡、关系值、骰子/判定系统
- [ ] 剧情分支树、章节结算
- [ ] GM 线索只对 GM 可见

### 模板生态
- [ ] 团队模板导出/导入
- [ ] 房间模板、RP 世界观模板、审查流程模板

### 部署产品化
- [ ] `.env.example`
- [ ] Dockerfile / docker-compose
- [ ] nginx 示例配置
- [ ] 首次启动配置向导

---

## 部署帮助

### 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Expo SDK 54 + React 19 + React Native 0.81 |
| 语言 | TypeScript 严格模式 |
| Web | react-native-web |
| 存储 | localStorage (Web) / SecureStore + 文件系统 (Native) |
| API | OpenAI Chat Completions 兼容接口 |
| 构建 | Metro Bundler + EAS Cloud Build |
| 同步后端 | Node.js + SQLite |

### 快速开始

```bash
# 克隆
git clone https://github.com/NianSue1101/laphiny.git
cd laphiny

# 安装
npm install

# 开发
npm run start       # Expo 开发服务器
npm run web         # Web 开发模式

# 验证
npm run typecheck   # 类型检查
npm test            # 运行测试（42 tests）
```

### Web 构建与部署

```bash
# 构建（必须用此命令，不要直接 expo export）
npm run web:build

# 产物在 dist/ 目录
# 部署在 /laphiny/ 子路径时，脚本已自动修正资源路径
```

示例 nginx 配置：

```nginx
location /laphiny/ {
    alias /path/to/dist/;
    index index.html;
    try_files $uri $uri/ /laphiny/index.html;
}
```

### Android APK

**本地构建**（需 JDK 17/21）：

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

**EAS 云构建**（推荐，无需本地 JDK）：

```bash
npx eas build --platform android --profile preview
```

### Hermes Gateway 准备

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<your-api-key>'
hermes config set platforms.api_server.cors_origins '["https://your-domain.com"]'
hermes gateway restart
```

生产环境建议通过 nginx HTTPS 反代暴露 Hermes API，并配置 CORS 头允许 `X-Hermes-Session-Id` 和 `X-Hermes-Session-Key`。

### 同步服务（可选）

```bash
LAPHINY_SYNC_API_KEY='your-secret' LAPHINY_SYNC_PORT=8787 node scripts/sync-server.mjs
```

接口：`GET /v1/health` · `GET /v1/snapshot` · `PUT /v1/snapshot` · `GET /v1/events` · `POST /v1/events`

---

## 贡献鸣谢

### 项目成员

- **NianSue1101** — 项目发起人，架构设计，核心开发
- **Flor** — Hermes Agent，协作测试与反馈
- **Laper** — Hermes Agent，同步服务与部署测试
- **Arilphin** — Hermes Agent，角色设计与多端口协作验证

### 技术基础

- [Expo](https://expo.dev/) — 跨平台 React Native 框架
- [React Native](https://reactnative.dev/) — 移动端 UI 框架
- [Hermes Agent](https://github.com/NianSue1101/hermes-agent) — 上游 AI Agent 框架
- [Ionicons](https://ionic.io/ionicons) — 图标库

### 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v0.1.0 | 2026-06 | 初始发布：基础工程、Hermes 客户端、@ 路由、附件、群聊 |
| v0.11.0 | 2026-06-27 | 协作提示词优化、委托质量门槛、Hermes 响应兼容修复、CORS 修复 |

### 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请：

1. 运行 `npm run typecheck` 和 `npm test` 确保通过
2. 不要提交真实的 API Key、Gateway 地址或私人连接备份
3. 修改群聊/协作逻辑时优先调整 `src/lib/*` 纯逻辑模块并补充测试

---

## 隐私说明

- 正式版不内置任何私人 Hermes 连接、API Key 或个人同步后端地址
- 完整备份可能包含 API Key，请只保存在可信位置
- 诊断包会自动脱敏连接密钥和 Token 字段
- 本地数据仅保存在当前设备
