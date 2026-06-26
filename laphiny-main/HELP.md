# Laphiny Help Index

Laphiny 是一个面向独立 Hermes Soul / Agent 的私人多 Agent 协作房间。它既支持专业任务协作，也支持桌游店式角色扮演。本文档集用于帮助新开发者、使用者和部署者快速理解项目。

## 快速阅读路径

1. [项目总览](./docs/help/01_PROJECT_OVERVIEW.md)
2. [功能清单](./docs/help/02_FEATURES.md)
3. [文件结构说明](./docs/help/03_FILE_GUIDE.md)
4. [代码功能详解](./docs/help/04_CODE_WALKTHROUGH.md)
5. [部署要点](./docs/help/05_DEPLOYMENT.md)
6. [排障与测试](./docs/help/06_TROUBLESHOOTING_AND_QA.md)
7. [特色与未来方向](./docs/help/07_FEATURES_AND_ROADMAP.md)

## 一句话定位

Laphiny 不是普通多模型聊天客户端，而是把已有 Hermes Soul / Agent 放进同一个房间，让它们保留各自人格和记忆，通过共享上下文、@ 委托、接力讨论、房间记忆、任务看板、灵庭动态和桌游式 RP 共同完成任务。

## 当前最重要的构建规则

Web 构建必须使用：

```bash
npm run web:build
```

不要直接运行：

```bash
npx expo export --platform web
```

原因：项目部署在 `/laphiny/` 子路径下，`npm run web:build` 会自动修正 Expo Web 产物中的资源路径。
