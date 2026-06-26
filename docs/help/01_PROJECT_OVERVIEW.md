# 项目总览

## Laphiny 是什么

Laphiny 是一个基于 Expo + React Native Web + TypeScript 的多端客户端，服务于 Hermes Gateway API。它的核心目标是连接多个已经存在的 Hermes Soul / Agent，让它们在同一个房间里进行专业协作或角色扮演。

它不是“一个模型切换器”，也不是“一个普通 ChatGPT UI”。它强调：

- Agent 已经存在，并且有自己的 Hermes soul、人格和长期记忆。
- Laphiny 不重写 Agent 的人格，只提供房间、共享上下文和协作协议。
- 群聊中每个 Agent 可以看到同一个房间的共享 transcript。
- Agent 可以通过行首 `@成员名 任务` 委托其他 Agent。
- 用户可以启动议会、红队、审查、复盘、RP 桌游等房间仪式。

## 使用场景

### 专业协作

适合产品设计、代码审查、需求拆解、方案评审、风险分析、日报复盘等。

典型用法：

```text
/council 这个项目下一步应该优先做什么？
/redteam 检查这个功能设计可能有什么问题。
/review 帮我审查这份部署方案。
/retro 总结这一阶段的进展和问题。
```

### 角色扮演

适合多 Agent 桌游店式 RP。一个 Agent 当 GM 推进故事，其他 Agent 可作为角色、NPC、旁白或氛围补充参与。

典型用法：

```text
/rp 我走进雨夜里的旧书店。
/scene 店里只有一盏绿色台灯，柜台后面坐着一个看不清脸的人。
/ooc 节奏慢一点，偏悬疑和心理描写。
/rp-stop
```

## 当前阶段

项目已经完成以下阶段能力：

- 阶段一：Expo / Web / Android 基础工程。
- 阶段二：Hermes client、类型、@ 路由、附件 payload、基础群聊。
- 阶段三：长期可用性，包括搜索、备份恢复、诊断日志、同步差异、长期存储、PWA。
- 阶段四：Soul-native 协作，包括协作仪式、任务卡、团队模板、房间记忆、RP 房间、灵庭、任务看板、Soul 关系图、启动引导。

## 关键概念

### Connection

一个 Hermes API 连接，代表一个 Soul / Agent 服务实例。包含 baseUrl、apiKey、model、enabled、协作卡片等。

### Room

一个聊天房间。可以是单聊，也可以是群聊。群聊可设置默认协作模式、房间模式、记忆胶囊、RP 配置、任务看板等。

### Room Member

房间内某个连接的别名和启用状态。`@` 匹配主要基于成员 alias 或 connectionId。

### Soul Atrium / 灵庭

项目中的全局事件与洞察空间，展示今日小队动态、任务、协作事件、Soul 关系、诊断日志、同步状态和备份恢复。

### Room Memory Capsule / 房间记忆胶囊

房间共享记忆，保存目标、决策、待办、偏好、未解决问题、交接提示。它属于 Laphiny 房间，不会写入 Hermes Soul 自己的长期记忆。

### RP Archive / 剧本档案

RP 房间的长期剧情档案，记录世界观、章节、NPC、地点、道具、线索、谜团、玩家选择和 GM 幕后笔记。
