import type { ChatMessage, HermesConnection } from '../types';
import type { QuickCommand } from '../app/app_types';
export const DEFAULT_MODEL = 'hermes-agent';
export const DEFAULT_API_KEY = '24a799bdc0ad4c0d73235ee83aae435a2e5b2cae4d7494abb120f7e15a0ba377';
export const DEFAULT_CONTEXT_LIMIT = 20;
export const MAX_DELEGATION_DEPTH = 3;
export const APP_VERSION = '0.1.0';

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

function makeConfigId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeDefaultConnections(): HermesConnection[] {
  const now = new Date().toISOString();
  return [
    {
      id: makeConfigId('conn'),
      name: 'Flor',
      baseUrl: 'https://nianxxz.site/hermes-api',
      apiKey: DEFAULT_API_KEY,
      model: DEFAULT_MODEL,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeConfigId('conn'),
      name: 'Laper',
      baseUrl: 'https://nianxxz.site/laper-api',
      apiKey: DEFAULT_API_KEY,
      model: DEFAULT_MODEL,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeConfigId('conn'),
      name: 'Arilphin',
      baseUrl: 'https://nianxxz.site/arilphin-api',
      apiKey: DEFAULT_API_KEY,
      model: DEFAULT_MODEL,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: makeConfigId('conn'),
      name: 'Derux',
      baseUrl: 'https://nianxxz.site/derux-api',
      apiKey: DEFAULT_API_KEY,
      model: DEFAULT_MODEL,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}
