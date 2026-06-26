# Laphiny

Laphiny 是一个特供 Hermes Agent 的多端聊天客户端：手机端产出 Android APK，其他端使用 Web/PWA。它面向“同时和多个 Hermes 人格/实例对话”的场景，优先实现群聊、@机制、图片与文件上下文上传。


## 帮助文档

项目审阅、功能说明、文件结构、代码详解、部署要点、排障和未来路线见 [`HELP.md`](./HELP.md)。

## 功能目标

- 多 Hermes Gateway API 连接管理
- 单聊 / 群聊房间
- `@name` / `@all` 控制哪些 Hermes 回复
- Soul 协作仪式：`/council`、`/redteam`、`/review`、`/retro`
- 角色扮演 RP 房间：选择一位主 Agent 作为 GM/主持人，其他 Agent 作为角色、NPC 或氛围补充参与
- 文本聊天
- 图片上传：以内联 `data:image/...` 发送到 Hermes API Server
- 文件上传：MVP 将文本类文件转成附件上下文发送
- Web/PWA 与 Android APK 同一套 Expo 代码

## Hermes Gateway API 要求

Hermes 端开启 API Server：

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<a-long-random-secret>'
hermes config set platforms.api_server.cors_origins '["http://localhost:8081","https://your-web-domain.example"]'
hermes gateway restart
```

生产环境请使用 HTTPS 反代或 Cloudflare Tunnel / Tailscale Funnel。HTTPS Web 页面不能请求裸 HTTP Hermes 接口。

## 本地开发

```bash
npm install
npm run start
npm run web
npm run typecheck
npm test
npm run sync:server
```

## Web 构建

```bash
npm run web:build
```

产物目录：`dist/`。

## Android APK 构建

参考 iHermes 的 Expo/Gradle 路线：

```bash
# 生成 android/ 原生工程
npx expo prebuild --platform android

# Debug APK
npm run android:assemble:debug

# Release APK
npm run android:assemble:release
```

产物路径：

- Debug: `android/app/build/outputs/apk/debug/`
- Release: `android/app/build/outputs/apk/release/`

也可以用 EAS 云构建预览 APK：

```bash
npm install -g eas-cli
eas build -p android --profile preview
```

## 开发计划

见 [`docs/PLAN.md`](./docs/PLAN.md)。


## 核心差异：Soul-native 多 Agent 协作

Laphiny 的定位不是普通多模型聊天客户端，而是给已有 Hermes Soul / Agent 使用的私人协作房间。

- 每个 Agent 保留自己的 Hermes soul、人格和记忆。
- Laphiny 只提供房间共享上下文、@ 委托、接力讨论和协作任务追踪。
- Agent 可以自动生成公开协作卡片，其他成员只看到公开摘要，不看到完整 soul。
- 群聊支持协作时间线、委托任务卡、团队模板和房间共识总结。

详见 `docs/STAGE4_SOUL_COLLABORATION.md`。


## Stage 4.2：协作仪式、房间记忆胶囊、今日小队动态

Laphiny 现在支持更强的 Soul-native 协作玩法：

- `/council` 议会模式：所有 Agent 独立发表观点，再生成最终共识。
- `/redteam` 红队审查：接力找漏洞、反例、失败场景和修正方案。
- `/review` 审查模式：按成员能力审查方案、代码、文案或交付物。
- `/retro` 复盘模式：复盘阶段进展、贡献、问题和下一步。
- 房间记忆胶囊：沉淀房间目标、共识、待办、偏好、未解决问题，并注入后续群聊上下文。
- 灵庭今日小队动态：展示当天 Agent 回复、委托、活跃房间、未完成任务和房间记忆状态。

## Stage 4 UX Polish

Laphiny 增加了 Soul Room 体验抛光：房间状态条、slash command 补全、Agent 徽章/状态、RP 场景卡、消息视觉分层、桌面协作侧栏和移动端模式快捷条。目标是让专业协作和桌游店 RP 都能被用户一眼理解、快速启动。


### Stage 4 Plus: Soul Room 深度体验

- **RP 剧本档案**：世界观、章节、NPC、地点、道具、线索、谜团、玩家选择和 GM 幕后笔记。
- **房间模式**：工作室 / 议会 / 审查 / 桌游 / 日常，一键切换默认协作行为。
- **任务看板**：委托任务按待处理、处理中、已完成、阻塞/失败展示。
- **Soul 关系图**：根据委托、完成和互相引用生成 Agent 协作关系。
- **首次启动向导与模板**：用产品设计、代码审查、桌游 RP、日常陪伴模板快速创建房间。

