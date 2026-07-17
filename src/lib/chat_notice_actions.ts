import type { ChatMessage, ChatNoticeActionId } from '../types';

export type ChatNoticeAction = {
  id: ChatNoticeActionId;
  label: string;
  title: string;
  description: string;
};

const ACTIONS: Record<ChatNoticeActionId, ChatNoticeAction> = {
  'delegation-limit': {
    id: 'delegation-limit',
    label: '调整委托上限',
    title: '每轮委托数',
    description: '调整普通模式下，一条 Agent 回复最多可创建多少张委托单。',
  },
  'delegation-tools': {
    id: 'delegation-tools',
    label: '检查委托设置',
    title: '委托方式',
    description: '检查自动委托与工具委托开关；修改后下一条消息立即生效。',
  },
  memory: {
    id: 'memory',
    label: '处理记忆草案',
    title: '房间记忆草案',
    description: '直接在聊天上方确认、丢弃或重新生成房间记忆。',
  },
  goal: {
    id: 'goal',
    label: '继续 / 调整目标',
    title: '目标控制',
    description: '继续当前目标，或把调整指令放回输入框。',
  },
  roleplay: {
    id: 'roleplay',
    label: '调整 RP 设置',
    title: '角色扮演设置',
    description: '在不离开聊天的情况下切换当前房间的 RP 模式。',
  },
};

export function getChatNoticeAction(message: ChatMessage): ChatNoticeAction | null {
  if (message.authorId !== 'system') return null;
  if (message.noticeActionId) return ACTIONS[message.noticeActionId];

  const content = message.content;
  if (/普通模式本轮最多接收/u.test(content)) return ACTIONS['delegation-limit'];
  if (/目标模式本轮最多接收|目标已达到.*安全上限|目标连续两轮没有结构化进展/u.test(content)) return ACTIONS.goal;
  if (/工具委托无有效任务/u.test(content)) return ACTIONS['delegation-tools'];
  if (/房间记忆草案已生成/u.test(content)) return ACTIONS.memory;
  if (/RP 模式已关闭/u.test(content)) return ACTIONS.roleplay;
  return null;
}
