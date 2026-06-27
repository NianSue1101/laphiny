# Laphiny 项目守则

## 构建命令

始终使用 `npm run web:build` 构建 Web 产物，不要直接运行 `npx expo export --platform web`。

原因：项目部署在 `/laphiny/` 子路径下时，Expo 默认输出的资源路径不包含子路径前缀。`npm run web:build` 会先导出 Web 产物，再运行 `scripts/fix-web-paths.mjs` 修正 `/_expo`、`/assets` 和 favicon 路径。

## 验证

每次改动后优先运行：

```bash
npm run typecheck
npm test
npm run web:build
```

Web 构建后确认：

- `dist/index.html` 中的脚本路径带 `/laphiny/_expo/...` 前缀。
- 图标字体资源路径带 `/laphiny/assets/...` 前缀。
- 本地静态服务访问 `/laphiny/` 能正常加载页面。

## Android

本地 Gradle 构建使用：

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

Windows 和 Unix 都通过 `scripts/run-gradle.mjs` 调用 Gradle wrapper。

本地 Android 构建建议使用 JDK 17 或 21。JDK 25 可能触发 `Unsupported class file major version 69`。

## 隐私与发布

- 不要把真实 Hermes Gateway 地址、API Key、个人同步后端地址或本地连接备份提交到仓库。
- 默认安装不应内置任何私人连接。
- 诊断包和备份功能必须明确提醒用户：完整备份可能包含 API Key，诊断包应脱敏。

## 协作提示

群聊中每个成员收到的 system prompt 由 `src/app/chat_history.ts` 构造。修改群聊、委托或协作行为时，优先调整那里和对应的 `src/lib/*` 纯逻辑模块，并补充测试。
