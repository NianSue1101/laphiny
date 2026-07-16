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

## App.tsx 模块划分

`App.tsx` 只作为应用壳、全局状态编排和顶层导航入口。后续新增或大改功能时，不要把整块 UI、业务流程或纯逻辑继续塞进 `App.tsx`。

- 页面级 UI 放到 `src/components/<feature>/`，例如 `connections/`、`rooms/`、`settings/`、`square/`。
- 可复用业务逻辑放到 `src/lib/*`，并优先补充 `tests/*.test.ts`。
- App 状态派生、常量、样式和类型分别放到 `src/app/*`、`src/config/*`、`src/app/app_styles.ts`、`src/app/app_types.ts`。
- 单个功能如果需要多个回调，先用 feature 组件接住 props；当 props 继续膨胀时，再抽 feature hook，而不是回退到 `App.tsx` 内联实现。
- 修改聊天、房间、连接、同步、灵庭等功能时，优先寻找已有 feature 目录；没有目录时先创建目录，再接入 `App.tsx`。

## 当前发布基线：v0.33.0

v0.33.0 的发布目标是让结构化委托可寻址、可诊断、可恢复，并把连接、流空闲和用户取消分别建模。不得把服务端没有返回的隐藏思维过程、工具结果、插件版本或委托成功状态推断出来。

### 迭代工作法

每轮都按以下闭环推进，并把状态写入结构化数据而不是只依赖 prompt：

1. 设立目标与可验证的验收条件。
2. 制定或调整计划，明确负责人、依赖和下一步。
3. 通过精确 `@` 将独立任务分发给合适的 Agent。
4. 并发执行互不依赖的工作，持续记录流式进度、委托和产物。
5. 汇总证据并审查是否满足验收条件。
6. 未满足时说明缺口、调整计划并进入下一轮；不得用一次回复假装完成。
7. 仅在完成、需要用户授权/选择、达到安全上限或确认阻塞时通知用户。

目标循环必须设有迭代、委托深度和无进展保护，避免无限自聊；但不能因为任务困难或一轮失败就提前结束。

### v0.33.0 完成验收

- 版本在 `package.json`、lockfile、Expo、Android 和应用内显示中统一为 `0.33.0`，Android `versionCode` 为 `330`。
- `npm run typecheck`、`npm test`、`npm run web:build` 全部通过；Web `/laphiny/` 入口、bundle、字体和离线资源可访问。
- 使用 JDK 17/21 完成 Android debug 与生产签名 release 构建，APK 签名与既有生产证书一致。
- Android 模拟器必须看到请求完成前的正文中间帧，并验证兼容提示小字、连接目录、失败委托重试/改派历史、全流超时、后台聚合与脱敏报告导出。
- 自动化测试覆盖：新旧 toolsets 形状、目录脱敏、attempt 幂等/竞态/迁移、连接/空闲/取消、部分正文结果未知、流事件聚合和报告 canary 拒绝。
- README 中英文和产品定位文档说明实际能力、隐私边界、限制与下一步，不得把计划中的功能写成已完成。
- 最终提交不得包含真实 Gateway、API Key、同步地址、签名密码、`.release-secrets/` 或本地备份；发布产物需记录 SHA-256 并验证远端上传摘要。
- PR、标签和 Release 必须指向同一个已验证提交；优先先合并前置 PR，再发布最终公开 Release。

### 下一轮方向：v0.34.x

- 将本地协作报告升级为持久化 `CollaborationRun`，支持按一次运行、时间范围或 Goal 跨轮筛选，并提供 Markdown 预览。
- 为委托改派增加成员选择器、手动取消 active attempt 和副作用风险确认；继续加强跨设备 CAS 与串行持久化。
- 将超时策略开放为高级设置，分别配置连接、流空闲和 Goal 流空闲，并增加网络恢复后的显式续跑建议。
- 建立 Android 4 房间 × 4 Agent 高频流的持续性能基准，继续减少长列表派生计算与后台未读抖动。
- 与 Hermes 插件协商并展示服务端明确报告的协议/版本；不以工具名推测兼容版本。
