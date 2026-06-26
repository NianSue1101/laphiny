# Stage 4 起点：Soul-native Agent 协作

阶段三之后，Laphiny 的核心差异不再是“多模型聊天客户端”，而是一个给已有 Hermes Soul / Agent 使用的私人协作房间。

## 核心定位

Laphiny 不重新创造 Agent，也不把 Agent 的完整 soul prompt 存在前端。每个 Agent 的底层人格、记忆和 soul 仍由自己的 Hermes 服务维护。Laphiny 负责：

- 房间共享上下文
- @ 协作路由
- Agent-to-Agent 委托
- 接力讨论与并行讨论
- 公开协作卡片
- 协作时间线与任务追踪
- 团队模板和总结产物

一句话：**让已有 soul 的独立 Agent 进入同一个房间协作。**

## 本阶段已加入的产品能力

### 1. Soul 协作时间线

每个群聊房间会记录协作事件：

- 用户发起协作轮次
- Agent 开始回复
- Agent 完成回复
- Agent 创建委托
- 被委托 Agent 开始处理
- 被委托 Agent 完成任务
- 生成房间共识总结
- 应用/保存团队模板

这些事件在聊天页的“Soul 协作时间线”和灵庭的“Soul 协作工作台”中可见。

### 2. 委托任务卡

Agent 在回复中使用行首 `@成员名 具体任务` 时，Laphiny 会生成委托任务卡。任务状态包括：

- 待处理
- 处理中
- 已完成
- 失败
- 已取消

任务卡保留委托来源、目标成员、任务文本、深度和完成结果，避免 Agent-to-Agent 协作只散落在聊天气泡中。

### 3. 房间共识总结

群聊工具面板可以生成“本轮共识总结”。总结者可以由用户指定，也可以自动选择房间中第一个启用成员。总结会保存到房间 `lastSummary`，并作为系统提示进入聊天记录。

### 4. 协作卡片版本历史

每次自动生成或更新协作卡片时，都会保存一个版本。用户可以在灵庭中查看最近版本并回滚。这样 Agent 的公开协作身份不会被一次错误自述永久覆盖。

### 5. 团队模板

用户可以把当前群聊的协作设置保存为团队模板，包括：

- 成员顺序
- 默认协作模式：手动 / 并行 / 接力
- 总结者
- 是否允许自动委托
- 最大委托深度

模板可以应用回房间，用于快速恢复同一组 Soul Agent 的协作方式。

## 需要保持的边界

- 不泄露完整 soul prompt。
- 不让其他 Agent 模仿当前 Agent 的人格。
- 不把 Laphiny 做成普通多模型客户端。
- 不把 @ 只当成 UI 提醒；在 Laphiny 中，@ 是协作路由协议。

## Stage 4.2: Collaboration Rituals, Memory Capsules, and Living Soul Atrium

This iteration deepens Laphiny's difference from generic AI chat clients. The room is no longer only a message stream; it becomes a ritual-driven Soul team workspace.

### Collaboration rituals

Group rooms now understand slash rituals:

- `/council` — parallel council: each enabled Soul gives an independent view, then the summary Soul produces a final consensus.
- `/redteam` — sequential red-team review: the team searches for risks, blind spots, failure modes, and fixes.
- `/review` — sequential review: the team checks a proposal, code, design, or deliverable from their own strengths.
- `/retro` — sequential retrospective: the team extracts progress, contribution, problems, and next actions.

These rituals are available in the quick command panel and can also be typed directly into the composer. Ritual completion creates collaboration events and a room consensus summary.

### Room memory capsule

Each group room can generate a shared Laphiny-owned memory capsule. This is separate from each Hermes Soul's private long-term memory.

A capsule stores:

- current room goal
- stable decisions
- todos
- user and collaboration preferences
- open questions
- handoff notes for future continuation

The capsule is injected into future group prompts so the team can continue from structured room state instead of only recent chat history.

### Living Soul Atrium

Soul Atrium now includes "Today's team dynamics":

- user messages and Agent replies today
- collaboration event counts
- completed and pending delegations
- active rooms
- per-Agent daily contribution stats
- rooms that already have memory capsules

This makes Soul Atrium feel less like a log page and more like the atrium of a living Soul team.

## Stage 4.3: Roleplay Rooms / Tabletop Mode

Laphiny now also supports a softer, playful use case beside professional collaboration: multi-Agent roleplay rooms.

A group room can enable **RP mode** and choose one Soul as the **GM / table host**. The GM is responsible for scene framing, pacing, NPCs, consequences, and asking the player what they do next. Other Souls can join as companions, NPCs, fragments of narration, inner voices, or atmosphere supplements, but they should not steal the GM's narrative authority.

### Commands

- `/rp ...` — start or continue a tabletop-style roleplay turn.
- `/scene ...` — update or emphasize the current scene before continuing.
- `/ooc ...` — make an out-of-character note about rules, pacing, tone, or boundaries.
- `/rp-stop` — turn RP mode off and return to normal collaboration routing.

When RP mode is enabled, ordinary player input is routed sequentially: **GM first, then the other enabled Agents** if “all agents enter roleplay” is enabled. This creates a tabletop-store feel: the host moves the story forward, then other Souls add character reactions and texture.

### Prompt boundary

RP mode does not overwrite each Hermes Soul's core personality. Laphiny only adds room-level stage directions:

- keep your own soul / voice;
- obey the shared RP premise and current scene;
- GM advances the story but never decides for the player;
- non-GM members add role/NPC/atmosphere responses without taking over the plot;
- OOC is allowed for rules and safety adjustments.

## UX Polish: Soul Room Experience

这一轮把 Stage 4 的体验层补齐，目标是让 Laphiny 不只是“功能很多”，而是让用户一眼看懂当前房间状态，并能低成本启动协作或角色扮演。

新增体验点：

- 房间顶部状态条：显示当前模式、可用成员数、GM、总结者、记忆胶囊版本和未完成委托数。
- 命令面板与 slash command 补全：输入 `/` 会提示 `/council`、`/redteam`、`/review`、`/retro`、`/rp`、`/scene`、`/ooc` 等命令。
- Agent 徽章与状态点：成员 chip 显示头像、选中状态、GM/思考中/被委托/停用等状态。
- 消息视觉分层：用户、系统、普通 Agent、GM、RP 角色、委托回复使用不同卡片风格。
- RP 场景卡：RP 模式下显示 GM、类型、基调、当前场景和“仅 GM / 全员入戏”。
- 桌面协作侧栏：宽屏下把委托任务、最近协作、共识总结、房间记忆集中在右侧抽屉。
- 移动端模式快捷条：输入框上方提供常用模式 chip，减少记忆命令成本。

这层优化不改变 Hermes Soul 的底层人格，只改善 Laphiny 作为“房间”和“桌游店”的使用体验。

## Stage 4 Plus: Soul Room 深度体验

本轮把 Laphiny 从“协作房间”继续推进为“可长期使用的 Soul Room”。重点不是增加普通聊天功能，而是让专业协作与角色扮演都能沉淀关系、任务、模式和档案。

### 1. RP 档案系统

RP 模式支持剧本档案，记录世界观、章节、当前任务、NPC、地点、道具、线索、未解谜团、玩家选择记录和 GM 幕后笔记。档案属于 Laphiny 房间层，不会写入 Hermes Soul 的私密长期记忆。

### 2. 房间模式系统

群聊可在工作室、议会、审查、桌游、日常之间切换。每种模式会带动默认协作触发、自动委托、RP 开关和提示词语气。

### 3. 任务看板

委托任务会自动进入看板：待处理、处理中、已完成、阻塞/失败。专业模式下是项目任务，RP 模式下也可作为主线/支线任务使用。

### 4. Soul 关系图

Soul Atrium 会根据委托、完成和互相引用统计 Agent 之间的协作关系，例如稳定搭档、常用委托、经常互相引用。

### 5. 首次启动向导与房间模板

房间页提供首次启动引导和示例模板：产品设计小队、代码审查小队、桌游 RP 小队、日常陪伴小队。模板只创建房间与模式配置，不导出 API Key。
