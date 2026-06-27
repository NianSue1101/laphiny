# Laphiny

Laphiny 是一个面向多 Hermes Agent 的本地优先协作聊天客户端，支持 Web/PWA 与 Android APK。它不是普通的多模型聊天壳，而是为多个 Hermes Soul / Agent 共同工作、互相委托、接力讨论和沉淀房间记忆而设计的协作房间。

## 主要能力

- 多 Hermes Gateway 连接管理。
- 单聊与群聊房间。
- `@成员名`、`@all`、`@all-seq` 控制回复对象和协作顺序。
- `/council`、`/redteam`、`/review`、`/retro` 等协作仪式。
- RP 房间、GM 选择、场景卡和剧本档案。
- 房间记忆胶囊、共识总结、任务看板、Soul 关系与灵庭动态。
- 图片与文本附件上下文。
- 跨房间 Agent 回复提醒：后台房间回复后会显示顶部提醒，点击可跳转。
- 设置页：同步、备份、诊断日志、项目与存储信息集中管理。

## 隐私说明

正式版不会内置任何私人 Hermes 连接、API Key 或个人同步后端地址。首次启动后需要用户自行添加连接。

本地数据默认保存在当前设备：

- Web/PWA 使用浏览器 localStorage。
- Android 密钥使用 SecureStore，长期聊天记录使用文件系统。

完整备份可能包含 API Key，请只保存在可信位置。诊断包会脱敏连接密钥和常见 token 字段。

## Hermes Gateway API

Hermes 端需要开启 API Server，例如：

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<a-long-random-secret>'
hermes config set platforms.api_server.cors_origins '["http://localhost:8081","https://your-web-domain.example"]'
hermes gateway restart
```

生产环境建议使用 HTTPS 反代、Cloudflare Tunnel、Tailscale Funnel 或同等级方案。HTTPS Web 页面不能直接请求未加密的 HTTP Hermes 接口。

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

产物目录为 `dist/`。

项目部署在 `/laphiny/` 子路径时，请始终使用 `npm run web:build`。该脚本会运行 `scripts/fix-web-paths.mjs` 修正 Web bundle、字体和 favicon 路径。

## Android APK

本地构建：

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

本地 Android 构建建议使用 JDK 17 或 21。JDK 25 可能触发 `Unsupported class file major version 69`。

EAS 云构建 preview APK：

```bash
npx eas build --platform android --profile preview
```

## 同步后端

开发用 SQLite 同步服务：

```bash
npm run sync:server
```

前端可在“设置”页填写同步后端地址和 API Key，使用前建议先点击“检查差异”。

## 项目结构

更多文件结构、功能说明和开发约定见：

- [HELP.md](./HELP.md)
- [docs/help/03_FILE_GUIDE.md](./docs/help/03_FILE_GUIDE.md)
- [docs/STAGE4_SOUL_COLLABORATION.md](./docs/STAGE4_SOUL_COLLABORATION.md)

## 发布检查

发布前建议至少运行：

```bash
npm run typecheck
npm test
npm run web:build
npx expo-doctor
```

并确认仓库中没有真实 API Key、私人 Gateway 地址或本地连接备份。
