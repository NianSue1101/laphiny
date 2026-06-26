# 排障与测试

## 本轮审阅发现并修复的问题

### 1. 某些设备显示方框叉字符

现象：部分 Web/Android 环境中，图标显示为一个长方形里面带叉，或显示为空白方框。

高概率原因：`@expo/vector-icons` 依赖图标字体。如果字体没有正确加载，React Native Web / Android 会把图标字形显示成 tofu 方框。

处理方式：当前版本已经移除 App UI 对 `@expo/vector-icons` 字体渲染的依赖，改成 `SafeIcon` 文本徽标。它使用普通 ASCII 文本如 `RP`、`OK`、`S`、`!`，不会依赖额外图标字体。

影响：UI 图标不再因为字体丢失而显示方框。视觉上更朴素，但更稳定。

### 2. 同步服务 SQL placeholder 数量错误

发现位置：`scripts/sync-server.mjs`

问题：

- `messages` 表插入 9 个字段，但 SQL 只有 8 个 placeholder。
- `square_events` 表插入 9 个字段，但 SQL 只有 8 个 placeholder。

结果：同步快照写入会报：

```text
8 values for 9 columns
```

已修复为 9 个 placeholder。

### 3. extra_state 只能读取对象，不能读取数组

发现位置：`scripts/sync-server.mjs`

问题：协作事件、任务、团队模板、卡片版本保存为数组，但读取 JSON 时排除了数组，导致 `collaborationEvents` 等读回为空。

已修复：JSON 解析现在允许对象和数组。

### 4. 测试文件误用 vitest

发现位置：

- `tests/collaboration_rituals.test.ts`
- `tests/room_memory.test.ts`

问题：项目脚本使用 Node test runner，但这两个文件 import 了 `vitest`，而 package 中没有 vitest。

已修复：改为 `node:test` + `node:assert/strict`。

## 推荐测试命令

依赖安装后：

```bash
npm install
npm test
npm run typecheck
npm run web:build
```

当前无 `node_modules` 环境下可使用：

```bash
for f in tests/*.test.ts; do npx --yes tsx "$f"; done
node --check scripts/sync-server.mjs
npx --yes esbuild App.tsx --bundle --platform=browser --outfile=/tmp/laphiny-check.js \
  --external:react \
  --external:react-native \
  --external:expo-status-bar \
  --external:expo-document-picker \
  --external:expo-file-system/legacy \
  --external:expo-clipboard \
  --external:react-native-url-polyfill/auto \
  --external:expo-image-picker \
  --external:expo-secure-store
```

## 已验证结果

本次审阅中完成：

- `node --check scripts/sync-server.mjs` 通过。
- `esbuild App.tsx` 通过，仅因当前环境缺少 Expo tsconfig 出现非致命 warning。
- 所有 `tests/*.test.ts` 通过。

## 常见问题

### Web 白屏

优先检查：

1. 是否使用 `npm run web:build`。
2. `dist/index.html` 里资源路径是否带 `/laphiny/`。
3. nginx 是否正确 rewrite `/laphiny/(.*)`。
4. 浏览器是否缓存了旧 service worker。

### Hermes 请求失败

检查：

1. baseUrl 是否能访问。
2. API Key 是否正确。
3. HTTPS 页面是否请求了 HTTP 接口。
4. Hermes CORS 是否允许当前域名。
5. 连接页健康检查的错误信息。
6. 灵庭诊断日志和脱敏诊断包。

### 群聊里 Agent 看不到彼此上下文

检查：

1. 是否在同一个 room。
2. 是否使用了并行 `@all`。并行模式下同一轮 Agent 互相看不到刚生成的内容。
3. 如果要接力共享本轮回复，使用 `@all-seq` 或设置房间默认接力模式。
4. 检查房间记忆胶囊是否已生成。

### Agent 被错误委托

当前自动委托只解析行首：

```text
@Laper 请处理这个构建问题
```

普通文本里提到 `@Laper` 不应触发。如果仍触发，检查 `src/lib/mentions.ts` 的 `ASSISTANT_DELEGATION_PATTERN`。

### 同步差异很多

先用“检查差异”，不要直接拉取或推送。差异类型包括本地独有、远端独有、本地较新、远端较新、同 id 内容不同。
