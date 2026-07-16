# Laphiny

> 把已有的 Hermes Soul / Agent 放进同一个房间，让它们保留各自人格与记忆，通过共享上下文、@ 路由、接力讨论、房间成长层、任务看板和协作仪式，像一支真正会磨合、会沉淀、会变熟的 AI 小队那样共同工作。

Laphiny 是一个本地优先的多 Agent 协作空间，支持 **Web/PWA** 与 **Android APK**。它不是普通的多模型聊天壳，而是为已经存在的 Hermes Soul / Agent 提供房间、共享 transcript、协作协议、附件、同步、移动端体验，以及一套让房间逐渐形成共同知识、开放黑板、稳定决策和 Soul 关系的成长层。

本项目采用自然语言编程，也就是全程大量使用 AI 生成与维护代码。

English documentation: [README.en.md](./README.en.md)

---

## 目录

- [项目定位](#项目定位)
- [主要功能](#主要功能)
- [v0.33.0 更新](#v0330-更新)
- [v0.32.3 更新](#v0323-更新)
- [v0.32.2 更新](#v0322-更新)
- [v0.32.1 更新](#v0321-更新)
- [v0.32.0 更新](#v0320-更新)
- [v0.30.3 更新](#v0303-更新)
- [v0.30.2 更新](#v0302-更新)
- [v0.22.1 更新](#v0221-更新)
- [v0.22.0 更新](#v0220-更新)
- [v0.20.0 更新](#v0200-更新)
- [v0.14.1 更新](#v0141-更新)
- [v0.14.0 更新](#v0140-更新)
- [文件结构](#文件结构)
- [快速开始](#快速开始)
- [构建与发布](#构建与发布)
- [同步服务](#同步服务)
- [反馈服务](#反馈服务)
- [Hermes Gateway](#hermes-gateway)
- [隐私说明](#隐私说明)
- [贡献鸣谢](#贡献鸣谢)

---

## 项目定位

最开始是因为想把多个已经存在、各有性格和能力的 AI Agent 拉到同一个空间里工作。Laphiny 提供的是一个房间：你可以把自己喜欢的、个性化的、已经拥有长期记忆的 Agent 叫进来，让它们一起评审代码、拆解需求、写作、跑团，或者只是开会。

Laphiny 的核心设计理念是 **Soul-native，而不是 Prompt-native**：

| 传统多 Agent 客户端 | Laphiny |
| --- | --- |
| 在客户端里临时创建角色 prompt | Agent 已存在，有自己的 soul、人格和记忆 |
| 模型切换 | Agent 协作 |
| 对话记录混在一起 | 每个 Agent 保持独立身份和会话 |
| 无结构化协作流程 | `/council` `/redteam` `/review` `/retro` |
| 无长期房间记忆 | 记忆确认、房间知识库、协作黑板、决策记录、任务看板 |

适合：

- 开发者 / 技术团队：多 Agent 审查代码、评审方案、拆解需求、分析风险
- 创作者 / 写作者：接力写作、角色扮演、世界观共创
- 私人 AI 小队用户：把自己的 Agent 放进同一个房间，让它们真正协作

### 用户是谁

用户在 Laphiny 里不是“给模型发 prompt 的人”，而是 **房间召集人、关系维护者和最终决策者**：

- 用户决定哪些 Hermes Soul 可以进入房间，以及它们以什么 alias、头像和协作模式出现
- 用户提出目标、判断产物是否可用，并确认哪些内容应该进入长期房间记忆
- 用户不需要把 Agent 当成一次性工具，也不需要把自己降格成调参者；更像是在经营一间工作室、议会或桌游桌
- Agent 可以互相委托、引用和形成稳定搭档关系，但最终边界、隐私和方向由用户确认

### Agent 如何成长

Laphiny 不会覆盖 Agent 自己在 Hermes 里的 soul。成长发生在“房间层”：

1. 刚进入房间时，Agent 只有自己的公开协作卡片、alias 和少量共享聊天记录。
2. 几轮协作后，房间会出现委托任务、共识总结、黑板事项和初步关系边。
3. 当用户确认记忆草案后，稳定事实会进入房间知识库，开放问题进入协作黑板，重要取舍进入决策记录。
4. 长期使用后，Agent 不只是“被调用的模型”，而是能在这个房间里知道边界、记住共同决策、识别搭档关系，并越来越像一支熟悉用户风格的小队。

---

## 主要功能

### 连接与房间

- 添加 / 编辑 / 删除 Hermes Gateway 连接
- 单聊 / 群聊房间
- 成员 alias、启用/停用、上下文条数、房间模式配置
- Agent 协作卡片与版本历史
- 房间导出 JSON / Markdown、清空记录与会话记忆

### 聊天与协作

- Hermes SSE 流式回复、停止生成、失败重试；Android 使用原生流式 transport，不再等待完整 body 后一次性显示
- Hermes 明确返回的工具/系统活动（例如记忆更新、技能操作）以独立小字状态呈现，不与正文或 reasoning 混写
- `@成员名` 精确指定 Agent（支持含空格 alias），`@all` 并行，`@all-seq` 接力
- 支持兼容 `@` 委托，以及安装 Hermes 插件后的结构化工具委托
- 一个成员生成时仍可向其他成员或其他房间继续发送；同一成员请求按顺序排队，避免会话串线
- 委托质量门槛和最大委托深度限制
- `/council` 议会、`/redteam` 红队、`/review` 审查、`/retro` 复盘
- Goal 模式：目标执行、复盘、自动完成/停止后的通知
- Agent 房间状态接口：Agent 可输出 `laphiny-room-state` 块，由 Laphiny 写入知识库、协作黑板和决策记录

### 房间成长层

- 房间知识库：保存稳定事实、用户偏好、项目约束和交接提示
- 协作黑板：保存开放问题、下一步动作和需要置顶的临时焦点
- 决策记录：保存已经确认的取舍、边界和结论，可标记过期
- Agent 可在回复中提交结构化状态补丁，真正推进房间目标，而不是只把建议留在聊天里
- 记忆沉淀确认面板：Agent 生成的是待确认草案，用户确认后才写入长期房间记忆
- Soul 关系图：根据委托、完成和互相引用统计 Agent 之间的协作关系
- 成长层会进入后续 Agent prompt，让房间从“刚被召集”逐步变成“形成稳定协作”的长期空间

### 文件与附件

- 图片上传为 `image_url` content part
- 文本文件作为 `<attachment>` 上下文注入
- Agent 可使用 `laphiny-file` 代码块返回 `.txt`、`.md`、`.png`、`.jpg/.jpeg`
- Laphiny 会把 Agent 返回的文件识别为消息后的附件卡片，点击后先进入预览，再从右上角下载
- Android 端首次选择下载目录后，后续附件、备份和诊断 JSON 会复用同一个目录

### 移动端体验

- 小屏手机选择房间后进入专注聊天界面
- 底部主导航保留，顶部只保留当前聊天名和返回
- 聊天选择页可展开当前房间，直接调整名称、成员、模式、上下文和 Agent 头像
- 输入框随键盘抬升，减少被输入法遮挡的情况

### 个性化与反馈

- 支持日间 / 夜间模式
- 消息时间戳可选显示日期，便于辨认跨日记录
- 支持系统字体与 LXGW WenKai 字体切换，后续可继续扩展字体
- Agent 头像可在连接页或手机房间选择页中替换
- 可切换功能集中在设置页；诊断日志默认收起，按需查看并附带日期时间
- 默认反馈服务：仅上传脱敏诊断包，不从服务器拉取日志到本机

### 通知与权限确认

- Agent 完成完整回复后可通过系统通知提醒
- Goal 模式只在自动完成或停止后通知
- 如果 Agent 回复需要用户同意、拒绝或总是同意，消息下方会出现权限确认卡片
- 需要确认的权限请求会通知用户；用户在 App 前台时不会弹系统通知
- 用户点击卡片按钮即可继续，不需要手动再发一条确认消息
- “总是同意”按 Agent connection 隔离并保存在本机，不会把一个 Agent 的授权套用到另一个 Agent

### 数据与同步

- 全局搜索
- 全量备份 / 合并恢复
- PWA 离线支持
- 可选 Node.js + SQLite 同步服务：快照推送/拉取、差异预检、事件轮询

---

## v0.33.0 更新

- **稳定 connection 目录**：群聊与委托提示会注入 `laphiny.connection-directory.v1`，只列当前房间启用成员的精确 ID、别名和公开协作卡片，不包含 Gateway 地址、API Key 或模型；Agent 调用 `laphiny_delegate_tasks` 时无需再猜内部 ID。
- **插件兼容诊断**：同时兼容新版 `{ data: [...] }` 与旧数组格式的 `/v1/toolsets`，区分 Responses API 缺失、插件缺失、工具集禁用、元数据不兼容和探测失败，并给出修复建议。Responses 运行时不兼容时会显示小字提示并安全回退普通聊天；取消和超时不会触发第二次请求。
- **委托重试与改派**：失败委托卡片支持一键重试和改派其他启用成员。逻辑任务 ID 保持不变，每次执行记录独立 attempt、operation ID、revision、目标、终态和改派历史；重复点击幂等，旧 attempt 的迟到结果不能覆盖当前执行，重启时未完成 attempt 会标记为中断。
- **完整流超时**：连接超时覆盖响应头之前，流空闲超时覆盖整个正文读取并按每个原始 chunk 重置，用户取消保持独立语义；收到部分正文后超时的委托会标记为“结果未知”，避免误称安全失败。
- **后台流与 Android 性能**：顶部聚合显示正在运行的 Agent/房间数量，房间状态按 phase 计数；Android 高频 delta 合并刷新为 140ms，单次 flush 只写一次消息，未变化的消息气泡不会随每个 delta 重绘；发送新消息时会重新锁定最新气泡，即使上一条回复很长也不会停留在旧位置。
- **脱敏协作报告**：群聊工具和移动端房间详情都可导出本地 JSON 报告。报告使用严格白名单和 Agent 化名，只包含结构化终态、attempt、事件类型和脱敏目标证据；检测到 URL、Token、邮箱、IP、路径或禁止字段会拒绝导出，不包含聊天正文、附件、私有连接或隐藏 reasoning。
- **能力边界**：重试仍是新的 Hermes 请求，不是服务端断点续传；`outcome_unknown` 表示首个 chunk 后连接状态无法证明是否发生外部副作用。插件版本未由 Gateway 报告时，Laphiny 不会猜测具体版本。
- **版本统一**：应用内、Expo、npm 与 Android 元数据统一为 `0.33.0`，Android `versionCode` 为 `330`。

---

## v0.32.3 更新

- **Android 真流式修复**：原生端改用 Expo 的流式 fetch transport；正文增量会在请求完成前持续进入消息，取消或失败时保留的半条回复会明确标记为未完成。
- **Hermes 活动提示**：解析 `hermes.tool.progress` 与 Responses 工具生命周期，把服务端明确返回的记忆更新、技能操作和其他工具活动显示为消息内的小字提示；不会推断或展示隐藏思维链。
- **时间与设置整理**：新增“消息时间显示日期”开关；外观、日期和 reasoning 等切换项集中展示；诊断日志默认折叠，展开后每条日志显示完整日期时间。
- **权限链路可靠性**：同意、拒绝和总是同意继续使用原会话；永久同意只对同一 Agent connection 和同一规范化请求生效，重复点击被去重，等待权限的委托不会提前标记完成。
- **委托边界加固**：规范化全角字符与中英文标点，拒绝歧义 alias，忽略引用和代码块里的示例，避免截断任务导致错误去重；缺失成员、无效工具参数和重复任务都会进入明确终态。
- **实机验收**：Android 模拟器验证了流式中间帧、工具提示、日期、折叠日志、权限继续、`@all-seq` 和 Agent 间结果回流。自动化测试为 104 项。
- **已知边界**：结构化工具委托仍要求 Hermes 插件拿到房间提供的精确 connection ID；旧插件或缺失 ID 时会明确失败，并可使用行首 `@成员 任务` 兼容路径。失败委托的一键改派与服务端断点续传仍是后续方向。
- **版本统一**：应用内、Expo、npm 与 Android 元数据统一为 `0.32.3`，Android `versionCode` 为 `323`。

---

## v0.32.2 更新

- **Hermes 权限回复修复**：权限卡片的“同意 / 拒绝 / 总是同意”现在会向同一会话发送 Hermes 所需的 `/approve` 或 `/deny` 控制命令，不再发送无法解除阻塞的自然语言说明；“总是同意”仍保留为 Laphiny 的本地偏好，并在后续相同请求上自动发送 `/approve`。
- **版本统一**：应用内、Expo、npm 与 Android 元数据统一为 `0.32.2`，Android `versionCode` 为 `322`。

## v0.32.1 更新

- **Hermes 工具委托（默认开启）**：安装 [`laphiny-hermes-delegation`](https://github.com/Lovely-Laper/laphiny-hermes-delegation) 后，连接测试会验证 Responses API 和 `laphiny_delegate_tasks` 工具。支持的 Agent 会以真实 `function_call` 事件提交精确 connection ID、任务、交付物和验收条件；Laphiny 再校验房间成员、深度和重复任务后调度。
- **一行安装**：在每个 Hermes Gateway 执行 `hermes plugins install Lovely-Laper/laphiny-hermes-delegation --enable && hermes gateway restart`。未安装或旧版 Gateway 自动保留本地结构化委托兼容路径。
- **房间管理改进**：工具委托开关位于群聊房间管理，默认开启；进入或返回同一房间会定位到最新消息，房间管理也可确认删除并清理本地分页历史与搜索索引。
- **版本统一**：应用内、Expo、npm 与 Android 元数据统一为 `0.32.1`，Android `versionCode` 为 `321`。

## v0.32.0 更新

- **长记录可靠加载**：房间只恢复最近分页，滚动接近顶部会自动加载更早一页，也保留手动重试入口；分页索引支持备份、自检与修复，损坏且无法恢复时会明确报错，不再静默显示空记录。
- **轻量完整搜索**：每页维护只含必要字段的搜索文档，搜索先定位命中页、再读取消息正文；5 万条历史的初始窗口仍固定为最近两页。
- **真正独立的 Agent 调度**：调度锁以“房间 + connection”划分，同一 Agent 的会话保持顺序，不同房间或 Agent 可并行回复；侧栏和房间栏会持续显示后台任务状态。
- **准确的 @ 与结构化委托**：完整 alias 与 connection ID 按边界匹配；重名会提示候选项而不是猜测。委托会记录目标、输入、交付物、验收条件、证据和重试来源。
- **可迭代 Goal 模式**：目标拥有计划、依赖、验收条件、证据、复盘历史和下一步动作，并在 planning / running / reviewing / adjusting 等状态间推进；只有证据满足验收才会完成，连续无进展或达到轮次上限时会安全暂停等待用户。
- **统一流式体验**：回复按排队、连接、思考、正文、委托、审查、完成/取消/失败阶段更新；应用重启后未完成回复会标记为中断并可按原 Agent 安全重试。
- **可选 reasoning 展示**：默认关闭，只展示兼容服务端明确返回的 `reasoning/thinking` 字段，与正文分离并进行节流刷新；不会生成或暴露模型未返回的隐藏思维过程。
- **能力边界**：重试会重新发起请求，不是从服务端断点续传；Goal 单次自动闭环默认最多 5 轮，并在连续 2 轮无实质进展时暂停，以避免无限循环和无意消耗。
- **版本统一**：应用内、Expo、npm 与 Android 元数据统一为 `0.32.0`，Android `versionCode` 为 `320`。

---

## v0.30.3 更新

- **旧消息按需展开**：分页房间顶部新增“加载更早消息”，每次只读取一个本地页，并保持当前阅读位置，长记录不必重新整段载入。
- **跨分页完整搜索**：只有开始搜索时才临时读取完整分页历史；清空搜索后释放完整搜索副本，正常聊天继续保持轻量启动。
- **分页清理修复**：清空房间记录时从第 0 页开始移除引用，避免旧分页文件继续占用有效索引。
- **版本显示统一**：应用内版本、Expo、npm 与 Android 元数据统一为 `0.30.3`。

---

## v0.30.2 更新

- **Android 长记录更快**：聊天记录升级为按房间分页存储。升级时会一次性迁移旧记录；迁移后启动仅加载每个房间最近两页，完整历史仍保留在本地，避免每次打开都解析整段长聊天。
- **真正的并行协作**：移除“任意 Agent 正在回复就锁住输入框”的全局限制。你可以在 A 回复时把新任务发给 B；同一 Soul 的任务仍自动串行，保持服务端会话顺序。
- **Android 流式与 reasoning 开关**：Android 与 Web 一样逐段呈现 SSE 回复。设置页可选择显示兼容服务端明确返回的 `reasoning/thinking` 字段；默认隐藏，且不会伪造内部思维。
- **更可靠的 @ 与委托**：路由按完整 alias / connection ID 和边界精确识别，支持 `@Project Manager` 这类多词名称，也不会把 `@Ann` 误匹配成 `@Anna`。Agent 委托同样使用行首精确匹配，减少误分发。
- **目标模式持续推进**：主 AI 以计划、验收条件、最小缺口、结构化状态和受限多委托来推进目标；每轮复盘后给出完成、继续或受阻状态，并在需要用户决定时通知。

---

## v0.22.1 更新

- 房间页“管理”改为在已有房间列表中原地展开，避免从房间列表跳回聊天页旧详情/旧工具面板导致管理对象错乱
- 移动端聊天首页取消重复的“调整”展开入口，改为统一进入房间页管理中心
- 房间管理中心集中维护名称、上下文、房间模式、默认协作策略、委托深度、成员启停、成员别名、头像、加入和移除
- 聊天页工具区收敛为协作工具，并提供“打开房间管理”跳转，基础房间设置不再在聊天页重复维护

---

## v0.22.0 更新

- 新增 `laphiny-room-state` Agent → 房间状态接口：Agent 可以把稳定知识、黑板事项、决策记录和已解决事项写回房间成长层
- Goal 模式 prompt 现在显式读取房间成长层，并要求主 AI 在推进目标时同步产出房间状态补丁
- 群聊共享记录提示增强：Agent 会看到本轮注入了多少条可见历史，以及更早历史应参考记忆胶囊和成长层
- 修复长回复 120 秒超时被误记为“手动停止”的问题；Goal 模式请求超时时间提高到 240 秒，普通聊天提高到 180 秒
- 诊断结论：小说创作房间有 52 条消息，但请求日志里 promptMessages 只有 2/3，这是因为共享历史被压缩成一个 prompt message；新提示会把记录条数写进共享历史正文，降低误解并增强连续性

---

## v0.20.0 更新

- 新增房间成长层：知识库、协作黑板、决策记录和成长阶段摘要
- 房间记忆生成改为“草案 → 用户确认 → 沉淀”的流程，避免未经确认的总结直接进入长期上下文
- 确认记忆后会自动把目标/偏好沉淀到知识库，把待办/问题放入黑板，把稳定结论写入决策记录
- 聊天 prompt 会注入房间成长层，让 Agent 在几轮协作后能看到更稳定的房间事实与边界
- 当前房间工具面板新增 Soul 关系图，展示 Agent 在该房间内的委托、完成和引用关系
- 产品定位更新：明确用户是房间召集人、关系维护者和最终决策者；Agent 的成长发生在房间共享层，而不是覆盖私密 soul
- PR 自动审查 workflow 避免对永久性 4xx 错误做无意义重试

---

## v0.14.1 更新

- 附件卡片点击后先进入预览页，右上角提供下载按钮，保留文件名、类型和大小信息
- Android 端下载目录会在首次授权后保存，附件、备份和诊断 JSON 复用同一目录
- 反馈日志改为默认服务器后端且仅允许上传；服务端不再暴露日志列表接口
- 诊断包从“复制到剪贴板”改为导出脱敏 JSON 文件
- 设置页项目信息新增 GitHub 作者资料摘要，并优化小屏显示细节

---

## v0.14.0 更新

- 手机端聊天选择页支持直接展开房间卡片，内联调整房间名、模式、上下文、成员启用状态和 Agent 头像
- Agent 返回 `文件名：xxx.txt` 加代码块时，也会生成可下载附件卡片
- 新增夜间模式、系统字体 / LXGW WenKai 字体切换和头像个性化入口
- 新增脱敏反馈日志上传与服务器日志拉取能力，配套 `scripts/feedback-server.mjs`
- 优化 PR 自动审查 Action：缩短 diff、延长 Hermes 请求超时并增加重试
- 新增产品策略文档：见 `docs/PRODUCT_STRATEGY.zh-CN.md`

---

## 文件结构

```text
laphiny/
├── App.tsx                    # 主应用入口：UI、状态、调度、房间、灵庭、设置
├── index.ts                   # Expo 入口注册
├── package.json               # 依赖与脚本
├── app.json                   # Expo / PWA / Android 配置
├── android/                   # Android 原生工程
├── public/                    # PWA Service Worker 与离线页
├── scripts/
│   ├── sync-server.mjs        # Node + SQLite 同步服务
│   ├── fix-web-paths.mjs      # 修正 /laphiny/ 子路径 Web 资源路径
│   └── run-gradle.mjs         # 跨平台 Gradle wrapper 调用
├── src/
│   ├── app/                   # App 层类型、工具、聊天历史构造
│   ├── components/            # UI 基础组件与 Markdown 渲染
│   ├── config/                # 版本、默认模型、快捷命令
│   ├── lib/                   # 可测试纯逻辑模块
│   ├── storage/               # Web / Native 存储抽象
│   └── types.ts               # 核心类型定义
├── tests/                     # Node test + tsx 测试
├── docs/                      # 帮助文档与设计文档
└── dist/                      # Web 构建产物
```

关键纯逻辑模块：

- `src/lib/hermes_client.ts`：Hermes API 客户端
- `src/lib/mentions.ts`：@ 路由与 Agent 委托解析
- `src/lib/agent_files.ts`：Agent 文件块识别
- `src/lib/agent_permissions.ts`：Agent 权限请求识别
- `src/lib/goal_mode.ts`：Goal 模式提示词与状态解析
- `src/lib/room_growth.ts`：房间知识库、黑板、决策记录和成长层 prompt
- `src/lib/sync_client.ts` / `src/lib/sync_conflicts.ts`：同步客户端与冲突预检

---

## 快速开始

```bash
git clone https://github.com/NianSue1101/laphiny.git
cd laphiny
npm install

npm run start
npm run web
```

验证：

```bash
npm run typecheck
npm test
npm run web:build
```

当前测试覆盖 104 个用例，包括流式事件、权限续跑、委托边界、调度隔离、Goal 状态机、长历史分页和索引修复。

---

## 构建与发布

### Web / PWA

始终使用：

```bash
npm run web:build
```

不要直接运行 `npx expo export --platform web`。项目部署在 `/laphiny/` 子路径下时，`npm run web:build` 会先导出 Web 产物，再运行 `scripts/fix-web-paths.mjs` 修正 `/_expo`、`/assets` 和 favicon 路径。

示例 nginx：

```nginx
location /laphiny/ {
    alias /path/to/dist/;
    index index.html;
    try_files $uri $uri/ /laphiny/index.html;
}
```

### Android APK

本地 Gradle 构建建议使用 JDK 17 或 21：

```bash
npm run android:assemble:debug
npm run android:assemble:release
```

Windows 和 Unix 都会通过 `scripts/run-gradle.mjs` 调用 Gradle wrapper。

---

## 同步服务

同步服务是可选的，适合在自己的云服务器上保存一份远端快照，并在 App 启动或回到前台时同步。

```bash
LAPHINY_SYNC_API_KEY='your-secret' LAPHINY_SYNC_PORT=8787 node scripts/sync-server.mjs
```

接口：

- `GET /v1/health`
- `GET /v1/snapshot`
- `PUT /v1/snapshot`
- `GET /v1/events`
- `POST /v1/events`

生产环境建议使用 systemd 保活，并通过 nginx HTTPS 反代。

---

## 反馈服务

反馈服务是可选的轻量 Node.js 服务，用于接收 App 上传的脱敏诊断包，并允许 App 从服务器拉取最近日志。

```bash
LAPHINY_FEEDBACK_API_KEY='your-secret' LAPHINY_FEEDBACK_PORT=8788 npm run feedback:server
```

接口：

- `GET /v1/health`
- `POST /v1/feedback`
- `GET /v1/feedback?limit=30`

生产环境建议使用 systemd 保活，并通过 HTTPS 反代。仓库默认不内置任何私人反馈服务器地址或 API Key。

---

## Hermes Gateway

示例配置：

```bash
hermes config set platforms.api_server.enabled true
hermes config set platforms.api_server.host 0.0.0.0
hermes config set platforms.api_server.port 8642
hermes config set platforms.api_server.key '<your-api-key>'
hermes config set platforms.api_server.cors_origins '["https://your-domain.com"]'
hermes gateway restart
```

生产环境建议通过 HTTPS 暴露 Gateway，并配置 CORS 允许 `X-Hermes-Session-Id` 和 `X-Hermes-Session-Key`。

---

## 隐私说明

- 正式版不内置任何私人 Hermes 地址、API Key、个人同步后端地址或本地连接备份
- 完整备份可能包含 API Key，请只保存在可信位置
- 诊断包会自动脱敏连接密钥和 Token 字段
- 默认本地数据只保存在当前设备；启用同步服务后，远端会保存你的快照数据

---

## 贡献鸣谢

### 项目成员

- **NianSue1101**：项目发起人、架构设计、核心开发
- **Flor**：Hermes Agent，协作与鼓劲
- **Laper**：Hermes Agent，代码和服务器执行
- **Arilphin**：Hermes Agent，吉祥物
- **Derux**：Hermes Agent，记录开发过程
- **Deepseek + ChatGPT + GLM**：真正的代码大王

### 技术基础

- [Expo](https://expo.dev/)
- [React Native](https://reactnative.dev/)
- [Hermes Agent](https://github.com/NianSue1101/hermes-agent)
- [LXGW WenKai](https://github.com/lxgw/LxgwWenKai)
- [Ionicons](https://ionic.io/ionicons)

### 参与贡献

欢迎提交 Issue 和 Pull Request。提交前请：

1. 运行 `npm run typecheck`、`npm test`、`npm run web:build`
2. 不要提交真实 API Key、Gateway 地址或私人连接备份
3. 修改群聊、委托或协作逻辑时优先调整 `src/app/chat_history.ts` 和 `src/lib/*` 纯逻辑模块，并补充测试
