# Laphiny

Laphiny 是一个特供 Hermes Agent 的多端聊天客户端：手机端产出 Android APK，其他端使用 Web/PWA。它面向“同时和多个 Hermes 人格/实例对话”的场景，优先实现群聊、@机制、图片与文件上下文上传。

## 功能目标

- 多 Hermes Gateway API 连接管理
- 单聊 / 群聊房间
- `@name` / `@all` 控制哪些 Hermes 回复
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
