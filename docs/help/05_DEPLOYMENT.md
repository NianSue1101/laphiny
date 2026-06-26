# 部署要点

## 本地开发

```bash
npm install
npm run start
npm run web
npm run typecheck
npm test
```

## Web 构建铁律

必须使用：

```bash
npm run web:build
```

不要直接使用：

```bash
npx expo export --platform web
```

原因：项目部署在 `/laphiny/` 子路径下，`npm run web:build` 会把 `/_expo` 和 `/favicon.ico` 等资源路径修正为 `/laphiny/_expo`、`/laphiny/favicon.ico`。

## Web 部署验证

构建后检查：

```bash
grep -o 'src="[^"]*"' dist/index.html
```

预期能看到：

```text
src="/laphiny/_expo/static/js/web/index-*.js"
```

如果浏览器白屏，优先检查：

- `dist/index.html` 资源路径是否有 `/laphiny/` 前缀。
- nginx 是否正确剥离 `/laphiny/` 前缀。
- JS 文件是否 404。
- Service Worker 是否缓存了旧版本。

## Hermes API 要求

Hermes 端需要开启 API Server：

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<a-long-random-secret>'
hermes gateway restart
```

生产环境建议：

- 使用 HTTPS 反代。
- 配置 CORS origin。
- 避免 HTTPS 页面请求 HTTP Hermes 服务。
- 不要把真实 API Key 提交到公共仓库。

## 同步服务部署

启动同步服务：

```bash
LAPHINY_SYNC_API_KEY='your-secret' \
LAPHINY_SYNC_PORT=8787 \
node scripts/sync-server.mjs
```

接口：

- `GET /v1/health`
- `GET /v1/snapshot`
- `PUT /v1/snapshot`
- `GET /v1/events?since=...`
- `POST /v1/events`

如果配置了 `LAPHINY_SYNC_API_KEY`，请求需要：

```text
Authorization: Bearer your-secret
```

## Android 构建

```bash
npx expo prebuild --platform android
npm run android:assemble:debug
npm run android:assemble:release
```

产物：

- Debug: `android/app/build/outputs/apk/debug/`
- Release: `android/app/build/outputs/apk/release/`

## PWA 注意事项

- `public/sw.js` 提供基础缓存与离线兜底。
- `public/offline.html` 是离线页面。
- 更新后如果用户仍看到旧 UI，可提示清理站点缓存或 unregister Service Worker。

## 存储策略

Web：

- localStorage 存储连接、房间、消息、事件和配置。

Native：

- API Key / syncConfig 等密钥类配置走 SecureStore。
- rooms、messages、灵庭事件、诊断日志等长期记录走文件系统 JSON。

## 安全提示

- 备份文件可能包含 API Key。
- 诊断包会脱敏，但完整备份不会脱敏。
- 公开仓库前应移除默认 API Key 或改为示例值。
