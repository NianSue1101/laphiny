# App.tsx 拆分与后续迭代说明

本文件给后续维护者和 Agent 使用，目标是避免继续把新功能堆进 `App.tsx`。

## 当前拆分边界

### `App.tsx`

保留应用级状态、数据加载、持久化、副作用、Hermes 请求调度、消息流和页面组合。

可以在 `App.tsx` 中保留的内容：

- React state / refs / effects
- 需要同时读写多个全局集合的流程，例如发送消息、同步、备份、通知
- 页面级渲染入口，例如 `renderChat`、`renderRooms`、`renderSettings`
- 还没有稳定边界的临时组合逻辑

不建议继续新增到 `App.tsx` 的内容：

- 大段独立 UI 面板
- 纯状态标签函数
- 不依赖 App state 的格式化函数
- 可复用输入控件、卡片、列表项
- 大段样式分组

### `src/components/AppText.tsx`

维护 App 级字体注入包装：

- `AppText`
- `AppTextInput`
- `setAppTextFontFamily`

后续不要在 `App.tsx` 里重新声明自定义 Text / TextInput。需要跟随字体设置的组件可以接收 `TextComponent` / `TextInputComponent`，或者直接使用该模块。

### `src/components/AttachmentPreviewModal.tsx`

附件预览弹窗组件，负责附件名称、类型、大小、图片/文本预览、下载和关闭按钮。

约束：

- 不直接持久化附件；下载通过 `onDownload` 回调交给 App。
- 不维护预览状态；当前附件和关闭行为由 App 控制。
- 需要跟随字体时使用外层传入的 `TextComponent`。

### `src/components/ActiveGoalPanel.tsx`

目标模式面板，负责展示当前 Goal、计划项、状态、最近复盘，以及继续/结束/调整按钮。

约束：

- 不直接 dispatch 消息；继续、结束、调整必须通过外层回调完成。
- 不解析 Goal 结果；只展示已经存在的 `activeGoal`。

### `src/components/ChatCommandPanels.tsx`

聊天输入区的命令 UI，包括：

- `ComposerModeBar`
- `SlashCommandPanel`

约束：

- 只负责展示和触发 `onInsertCommand`。
- 不改写 draft，不直接读取 App state。

### `src/components/ChatSidebar.tsx`

桌面聊天页左侧房间列表，负责房间切换、新建入口、未读和最后一条消息预览。

约束：

- 不修改房间，只通过 `onOpenRoom` / `onCreateRoom` 回调通知 App。
- 不放房间管理表单；基础设置统一在 `RoomManagementPanel`。

### `src/components/MessageSearchPanel.tsx`

消息搜索面板，负责搜索输入、结果列表、结果跳转。

约束：

- 搜索结果由 App 计算，组件只展示 `results`。
- 不直接修改房间或消息；打开结果通过 `onOpenRoom` 回调完成。

### `src/components/MobileRoomPicker.tsx`

移动端专注聊天前的房间选择器，负责移动端房间卡片、未读、最后消息预览、进入和管理跳转。

约束：

- “管理”只能调用 `onManageRoom`，不在移动选择器内展开第二套表单。
- “进入”只调用 `onOpenRoom`。

### `src/components/RoomRail.tsx`

聊天页顶部/移动端横向房间 rail，负责快速切换房间和新建入口。

约束：

- 只展示和切换，不承载房间管理逻辑。

### `src/components/RuntimeBanner.tsx`

Web/PWA 运行状态横幅，负责离线、Service Worker 和安装提示。

约束：

- 只展示状态和触发安装回调，不处理网络状态监听。

### `src/components/RoleplayArchivePanel.tsx`

RP 剧本档案面板，负责展示档案摘要、主线、NPC、线索和 GM 笔记，并触发整理/清空回调。

约束：

- 不调用 Hermes；整理和清空通过外层回调完成。
- 不维护 RP archive state。

### `src/components/RoleplaySceneCard.tsx`

RP 当前场景卡片，负责展示 GM、类型、语气、当前场景和剧本档案摘要。

约束：

- 不修改 RP 状态；场景写入仍由 App/RP 流程处理。

### `src/components/RoomStatusBar.tsx`

房间状态条，负责展示模式、成员可用数、GM、总结者、记忆版本、档案版本和开放委托数量。

约束：

- 只读 `room` 和 delegation tasks。
- 不触发任何写入。

### `src/components/TaskBoardPanel.tsx`

任务看板面板，负责按列展示委托任务。

约束：

- `columns` 由 `buildTaskBoard` 在 App 中计算，组件不参与任务状态变更。
- 后续若要支持拖拽改状态，应先设计任务状态写入回调，不要在组件里直接改 App state。

### `src/components/RoomManagementPanel.tsx`

房间管理中心组件，负责房间页里的原地管理体验：

- 房间名称
- 上下文预算
- 房间模式
- 默认协作策略
- 自动委托
- 最大委托深度
- 成员启用/停用
- 成员别名
- 头像
- 加入/移除成员

约束：

- 不在组件内直接持久化；通过 `updateRoomInline` 回调写回 App state。
- 不切换 tab；进入聊天或关闭管理由外层回调处理。
- 不复制聊天页工具区逻辑；它是房间页唯一基础管理入口。

### `src/app/app_status_labels.ts`

纯状态标签函数，后续新增 label 逻辑优先放这里。

目前包括：

- Goal 状态标签
- Goal plan item 状态标签
- 协作黑板状态标签
- 决策记录状态标签

## 推荐的下一轮拆分

### 1. 样式拆分

`App.tsx` 最大的剩余体积来自 `StyleSheet.create`。建议下一轮单独做低风险样式迁移：

```text
src/app/app_styles.ts
```

建议一次完整迁移，不要分多处 StyleSheet，避免样式名互相查找困难。迁移后：

```ts
import { styles } from './src/app/app_styles';
```

注意事项：

- `app_styles.ts` 需要自己 import `StyleSheet`、`Platform`、`StatusBar as NativeStatusBar`。
- 不要顺手改视觉细节；这轮只移动，不改样式值。
- 迁移后必须跑 `npm run typecheck`、`npm test`、`npm run web:build`。

### 2. 页面面板拆分

按下面顺序拆，风险从低到高：

1. `renderRoomGrowthPanel` → `src/components/RoomGrowthPanel.tsx`
2. `renderSoulRelationsPanel` → `src/components/SoulRelationsPanel.tsx`
3. `renderRoomCollaborationDashboard` → `src/components/RoomCollaborationDashboard.tsx`
4. `renderSettings` 内部的设置卡片 → `src/components/settings/*`
5. `renderMessageBubble` → `src/components/chat/MessageBubble.tsx`

原则：先拆展示型组件，后拆会触发请求/写入的组件。

### 3. 流程逻辑拆分

已经比较稳定的流程可以移到 `src/app/*`：

- Goal run state reducer
- 发送消息调度器
- Hermes reply 解析与后处理
- 房间导入/导出
- 设置页备份/诊断导出

但这类拆分风险高，因为涉及大量状态写入；拆前应补测试。

## 给后续 Agent 的提示词

处理本项目时请遵守：

```text
你正在维护 Laphiny，一个 Soul-native 多 Agent 房间客户端。不要把新功能继续堆进 App.tsx。新增 UI 面板优先放在 src/components；纯函数优先放在 src/app 或 src/lib；只有全局状态编排和副作用留在 App.tsx。拆分时不要改变功能行为，不要顺手改 UI 文案或视觉，除非任务明确要求。每轮拆分必须跑 npm run typecheck、npm test、npm run web:build。
```

房间管理相关任务请遵守：

```text
房间基础设置只有一个主入口：房间页的 RoomManagementPanel。不要再在聊天页新增第二套名称、成员、模式、上下文管理入口。聊天页可以提供跳转到房间管理的按钮，但不要复制管理表单。
```

字体相关任务请遵守：

```text
需要跟随用户字体设置的普通文本，使用 AppText/AppTextInput 或从 App 传入 TextComponent/TextInputComponent。代码块、行内代码等需要等宽字体的内容可以保留 monospace。
```

## 验收清单

每次拆分后至少检查：

```bash
npm run typecheck
npm test
npm run web:build
```

并确认：

- App 启动无异常
- 聊天页能进入房间
- 房间页能创建和管理房间
- 字体切换仍影响普通文本
- Web 构建后仍显示 `paths fixed`
