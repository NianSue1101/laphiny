import type { ChatMessage } from '../types';
import type { QuickCommand } from '../app/app_types';
export const DEFAULT_MODEL = 'hermes-agent';
export const DEFAULT_CONTEXT_LIMIT = 20;
export const MAX_DELEGATION_DEPTH = 3;
export const APP_VERSION = '0.33.0';

export const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'deploy',
    label: '构建部署',
    icon: 'rocket-outline',
    targetAlias: 'Laper',
    prompt: '请检查当前项目状态，执行构建部署流程，并返回结果和下一步建议。',
  },
  {
    id: 'daily',
    label: '日报',
    icon: 'newspaper-outline',
    targetAlias: 'Derux',
    prompt: '请整理今天的进展日报，按已完成、风险、明日计划输出。',
  },
  {
    id: 'fund',
    label: '查基金',
    icon: 'stats-chart-outline',
    targetAlias: 'Derux',
    prompt: '请查询并总结我关注的基金/市场信息，给出需要注意的变化。',
  },
  {
    id: 'summarize',
    label: '总结房间',
    icon: 'reader-outline',
    targetAlias: 'Flor',
    prompt: '请总结当前房间最近的对话，提炼待办、结论和未解决问题。',
  },
];

export const STATUS_LABELS: Record<ChatMessage['status'], string> = {
  local: '提示',
  queued: '排队',
  running: '思考中',
  sent: '已发送',
  stopped: '已停止',
  error: '失败',
};

