export type UXCommandKind = 'work' | 'ritual' | 'roleplay' | 'memory' | 'goal';

export interface UXCommandDefinition {
  id: string;
  command: string;
  label: string;
  description: string;
  insertText: string;
  kind: UXCommandKind;
}

export const UX_SLASH_COMMANDS: UXCommandDefinition[] = [
  {
    id: 'goal',
    command: '/goal',
    label: '目标模式',
    description: '选择一个主 AI 先拆解目标、制定计划、分配成员实现，并在每轮后复盘推进。',
    insertText: '/goal ',
    kind: 'goal',
  },
  {
    id: 'council',
    command: '/council',
    label: '议会模式',
    description: '多 Agent 独立给观点，再由总结者形成最终共识。',
    insertText: '/council ',
    kind: 'ritual',
  },
  {
    id: 'redteam',
    command: '/redteam',
    label: '红队审查',
    description: '让 Soul 小队从风险、漏洞、反例和修正方案角度审查。',
    insertText: '/redteam ',
    kind: 'ritual',
  },
  {
    id: 'review',
    command: '/review',
    label: '审查模式',
    description: '一个 Agent 产出，其他 Agent 接力做代码/体验/风险审查。',
    insertText: '/review ',
    kind: 'ritual',
  },
  {
    id: 'retro',
    command: '/retro',
    label: '复盘模式',
    description: '总结做了什么、谁贡献了什么、下次怎么更好。',
    insertText: '/retro ',
    kind: 'ritual',
  },
  {
    id: 'rp',
    command: '/rp',
    label: 'RP 回合',
    description: '进入或继续桌游店式角色扮演，由 GM 推进故事。',
    insertText: '/rp ',
    kind: 'roleplay',
  },
  {
    id: 'scene',
    command: '/scene',
    label: '更新场景',
    description: '维护当前场景，让 GM 把新地点、氛围或事件融入剧情。',
    insertText: '/scene ',
    kind: 'roleplay',
  },
  {
    id: 'ooc',
    command: '/ooc',
    label: '场外说明',
    description: '不入戏地调整规则、节奏、基调、边界或玩家偏好。',
    insertText: '/ooc ',
    kind: 'roleplay',
  },
  {
    id: 'rp-stop',
    command: '/rp-stop',
    label: '关闭 RP',
    description: '结束桌游店模式，恢复普通 Soul 协作房间。',
    insertText: '/rp-stop',
    kind: 'roleplay',
  },
  {
    id: 'memory',
    command: '/memory',
    label: '记忆胶囊',
    description: '提示用户在工具里生成或更新房间共享记忆。',
    insertText: '/memory ',
    kind: 'memory',
  },
];

export function getSlashCommandSuggestions(input: string, limit = 8): UXCommandDefinition[] {
  const query = input.trim().toLowerCase();
  if (!query.startsWith('/')) return [];
  const normalized = query.slice(1);
  const matches = UX_SLASH_COMMANDS.filter((item) => {
    const command = item.command.toLowerCase().slice(1);
    return command.startsWith(normalized) || item.label.toLowerCase().includes(normalized) || item.description.toLowerCase().includes(normalized);
  });
  return matches.slice(0, limit);
}

export function getUxCommandKindLabel(kind: UXCommandKind): string {
  if (kind === 'goal') return '目标模式';
  if (kind === 'ritual') return '协作仪式';
  if (kind === 'roleplay') return '角色扮演';
  if (kind === 'memory') return '房间记忆';
  return '工作流';
}
