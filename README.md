# Laphiny

> 把已有的 Hermes Soul / Agent 放进同一个房间，让它们保留各自人格与记忆，通过共享上下文、@ 路由、接力讨论、房间记忆、任务看板和协作仪式，像一支真正的 AI 小队那样共同工作。

Laphiny 是一个本地优先的多 Agent 协作聊天客户端，支持 **Web/PWA** 与 **Android APK**。它不是普通的多模型聊天壳，而是为已经存在的 Hermes Soul / Agent 提供房间、共享 transcript、协作协议、附件、同步和移动端使用体验。

本项目采用自然语言编程，也就是全程大量使用 AI 生成与维护代码。

English documentation: [README.en.md](./README.en.md)

---

## 目录

- [项目定位](#项目定位)
- [主要功能](#主要功能)
- [v0.13.0 更新](#v0130-更新)
- [文件结构](#文件结构)
- [快速开始](#快速开始)
- [构建与发布](#构建与发布)
- [同步服务](#同步服务)
- [Hermes Gateway](#hermes-gateway)
- [隐私说明](#隐私说明)
- [贡献鸣谢](#贡献鸣谢)

---

## 项目定位

最开始是因为想把多个已经存在、各有性格和能力的 AI Agent 拉到同一个空间里工作。Laphiny 提供的是一个房间：你可以把自己喜欢的、个性化的、已经拥有长期记忆的 Agent 叫进来，让它们一起评审代码、拆解需求、写作、跑团，或者只是开会。

Laphiny 的核心设计理念是 **Soul-native，而不是 Prompt-native**：

| 传统多 Agent 客户端 | Laphiny |
| --- | --- |
| 在客户端里临时创建角色 prompt | Agent 已存在，有自己的 soul、人格和记忆 |
| 模型切换 | Agent 协作 |
| 对话记录混在一起 | 每个 Agent 保持独立身份和会话 |
| 无结构化协作流程 | `/council` `/redteam` `/review` `/retro` |
| 无长期房间记忆 | 房间记忆胶囊、共识总结、任务看板 |

适合：

- 开发者 / 技术团队：多 Agent 审查代码、评审方案、拆解需求、分析风险
- 创作者 / 写作者：接力写作、角色扮演、世界观共创
- 私人 AI 小队用户：把自己的 Agent 放进同一个房间，让它们真正协作

---

## 主要功能

### 连接与房间

- 添加 / 编辑 / 删除 Hermes Gateway 连接
- 单聊 / 群聊房间
- 成员 alias、启用/停用、上下文条数、房间模式配置
- Agent 协作卡片与版本历史
- 房间导出 JSON / Markdown、清空记录与会话记忆

### 聊天与协作

- Hermes SSE 流式回复、停止生成、失败重试
- `@成员名` 指定 Agent，`@all` 并行，`@all-seq` 接力
- Agent 行首 `@成员名 任务` 自动创建委托任务并转发
- 委托质量门槛和最大委托深度限制
- `/council` 议会、`/redteam` 红队、`/review` 审查、`/retro` 复盘
- Goal 模式：目标执行、复盘、自动完成/停止后的通知

### 文件与附件

- 图片上传为 `image_url` content part
- 文本文件作为 `<attachment>` 上下文注入
- Agent 可使用 `laphiny-file` 代码块返回 `.txt`、`.md`、`.png`、`.jpg/.jpeg`
- Laphiny 会把 Agent 返回的文件识别为消息后的附件卡片，点击即可下载

### 移动端体验

- 小屏手机选择房间后进入专注聊天界面
- 底部主导航保留，顶部只保留当前聊天名和返回
- 房间设置、成员、工具在进入聊天前处理
- 输入框随键盘抬升，减少被输入法遮挡的情况

### 通知与权限确认

- Agent 完成完整回复后可通过系统通知提醒
- Goal 模式只在自动完成或停止后通知
- 如果 Agent 回复需要用户同意、拒绝或总是同意，消息下方会出现权限确认卡片
- 需要确认的权限请求会通知用户；用户在 App 前台时不会弹系统通知
- 用户点击卡片按钮即可继续，不需要手动再发一条确认消息

### 数据与同步

- 全局搜索
- 全量备份 / 合并恢复
- PWA 离线支持
- 可选 Node.js + SQLite 同步服务：快照推送/拉取、差异预检、事件轮询

---

## v0.13.0 更新

- 移动端房间入口改为专注聊天模式，小屏聊天区域更大
- 修复 Android 附件下载路径，Agent 返回的 txt/md/image 文件可通过附件卡片保存
- 新增本地通知：完整 Agent 回复、Goal 结束/停止、权限请求待确认
- 前台使用 App 时禁用系统通知，避免重复打扰
- 新增 Agent 权限请求识别与操作卡片：同意、拒绝、总是同意
- 新增英文 README

---

## 文件结构

```text
laphiny/
├── App.tsx                    # 主应用入口：UI、状态、调度、房间、灵庭、设置
├── index.ts                   # Expo 入口注册
├── package.json               # 依赖与脚本
├── app.json                   # Expo / PWA / Android 配置
├── android/                   # Android 原生工程
├── public/                    # PWA Service Worker 与离线页
├── scripts/
│   ├── sync-server.mjs        # Node + SQLite 同步服务
│   ├── fix-web-paths.mjs      # 修正 /laphiny/ 子路径 Web 资源路径
│   └── run-gradle.mjs         # 跨平台 Gradle wrapper 调用
├── src/
│   ├── app/                   # App 层类型、工具、聊天历史构造
│   ├── components/            # UI 基础组件与 Markdown 渲染
│   ├── config/                # 版本、默认模型、快捷命令
│   ├── lib/                   # 可测试纯逻辑模块
│   ├── storage/               # Web / Native 存储抽象
│   └── types.ts               # 核心类型定义
├── tests/                     # Node test + tsx 测试
├── docs/                      # 帮助文档与设计文档
└── dist/                      # Web 构建产物
```

关键纯逻辑模块：

- `src/lib/hermes_client.ts`：Hermes API 客户端
- `src/lib/mentions.ts`：@ 路由与 Agent 委托解析
- `src/lib/agent_files.ts`：Agent 文件块识别
- `src/lib/agent_permissions.ts`：Agent 权限请求识别
- `src/lib/goal_mode.ts`：Goal 模式提示词与状态解析
- `src/lib/sync_client.ts` / `src/lib/sync_conflicts.ts`：同步客户端与冲突预检

---

## 快速开始

```bash
git clone https://github.com/NianSue1101/laphiny.git
cd laphiny
npm install

npm run start
npm run web
```

验证：

```bash
npm run typecheck
npm test
npm run web:build
```

当前测试覆盖 54 个用例，主要覆盖 `src/lib/*` 的纯逻辑模块。

---

## 构建与发布

### Web / PWA

始终使用：

```bash
npm run web:build
```

不要直接运行 `npx expo export --platform web`。项目部署在 `/laphiny/` 子路径下时，`npm run web:build` 会先导出 Web 产物，再运行 `scripts/fix-web-paths.mjs` 修正 `/_expo`、`/assets` 和 favicon 路径。

示例 nginx：

```nginx
location /laphiny/ {
    alias /path/to/dist/;
    index index.html;
    try_files $uri $uri/ /laphiny/index.html;
}
```

### Android APK

本地 Gradle 构建建议使用 JDK 17 或 21：

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

Windows 和 Unix 都会通过 `scripts/run-gradle.mjs` 调用 Gradle wrapper。

---

## 同步服务

同步服务是可选的，适合在自己的云服务器上保存一份远端快照，并在 App 启动或回到前台时同步。

```bash
LAPHINY_SYNC_API_KEY='your-secret' LAPHINY_SYNC_PORT=8787 node scripts/sync-server.mjs
```

接口：

- `GET /v1/health`
- `GET /v1/snapshot`
- `PUT /v1/snapshot`
- `GET /v1/events`
- `POST /v1/events`

生产环境建议使用 systemd 保活，并通过 nginx HTTPS 反代。

---

## Hermes Gateway

示例配置：

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<your-api-key>'
hermes config set platforms.api_server.cors_origins '["https://your-domain.com"]'
hermes gateway restart
```

生产环境建议通过 HTTPS 暴露 Gateway，并配置 CORS 允许 `X-Hermes-Session-Id` 和 `X-Hermes-Session-Key`。

---

## 隐私说明

- 正式版不内置任何私人 Hermes 地址、API Key、个人同步后端地址或本地连接备份
- 完整备份可能包含 API Key，请只保存在可信位置
- 诊断包会自动脱敏连接密钥和 Token 字段
- 默认本地数据只保存在当前设备；启用同步服务后，远端会保存你的快照数据

---

## 贡献鸣谢

### 项目成员

- **NianSue1101**：项目发起人、架构设计、核心开发
- **Flor**：Hermes Agent，协作与鼓劲
- **Laper**：Hermes Agent，代码和服务器执行
- **Arilphin**：Hermes Agent，吉祥物
- **Derux**：Hermes Agent，记录开发过程
- **Deepseek + ChatGPT + GLM**：真正的代码大王

### 技术基础

- [Expo](https://expo.dev/)
- [React Native](https://reactnative.dev/)
- [Hermes Agent](https://github.com/NianSue1101/hermes-agent)
- [Ionicons](https://ionic.io/ionicons)

### 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请：

1. 运行 `npm run typecheck`、`npm test`、`npm run web:build`
2. 不要提交真实 API Key、Gateway 地址或私人连接备份
3. 修改群聊、委托或协作逻辑时优先调整 `src/app/chat_history.ts` 和 `src/lib/*` 纯逻辑模块，并补充测试
