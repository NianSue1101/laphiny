import { Room, RoomMember, RoleplayConfig } from '../types';

export type RoleplayCommandId = 'rp' | 'scene' | 'ooc' | 'stop';
export type RoleplayCommandKind = 'start' | 'scene' | 'ooc' | 'stop';

export interface ParsedRoleplayCommand {
  id: RoleplayCommandId;
  kind: RoleplayCommandKind;
  topic: string;
  rawCommand: string;
}

export function makeDefaultRoleplayConfig(gmConnectionId?: string): RoleplayConfig {
  return {
    enabled: false,
    gmConnectionId,
    playerName: '玩家',
    genre: '奇幻冒险',
    tone: '沉浸、轻桌游、重角色互动',
    premise: '一场由 Laphiny Soul 小队共同参与的角色扮演冒险。',
    currentScene: '',
    includeAllAgents: true,
    updatedAt: new Date().toISOString(),
  };
}

export function parseRoleplayCommand(text: string): ParsedRoleplayCommand | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^\/(rp|roleplay|gm|scene|ooc|rp-stop)(?:\s+|$)([\s\S]*)$/i);
  if (!match) return null;
  const raw = match[1]?.toLowerCase() ?? 'rp';
  const topic = (match[2] ?? '').trim();
  if (raw === 'rp-stop') return { id: 'stop', kind: 'stop', topic, rawCommand: match[0] };
  if (raw === 'scene') return { id: 'scene', kind: 'scene', topic, rawCommand: match[0] };
  if (raw === 'ooc') return { id: 'ooc', kind: 'ooc', topic, rawCommand: match[0] };
  return { id: 'rp', kind: 'start', topic, rawCommand: match[0] };
}

export function isRoleplayUserTurn(room: Room, text: string): boolean {
  if (room.kind !== 'group') return false;
  const command = parseRoleplayCommand(text);
  if (command?.kind === 'stop') return false;
  if (command) return true;
  if (!room.roleplay?.enabled) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/^[@＠]/.test(trimmed)) return false;
  if (/^\/(council|redteam|review|retro)\b/i.test(trimmed)) return false;
  return true;
}

export function getRoleplayTargets(room: Room): RoomMember[] {
  if (room.kind !== 'group' || !room.roleplay?.enabled) return [];
  const enabledMembers = room.members.filter((member) => member.enabled);
  if (!enabledMembers.length) return [];
  const gm = enabledMembers.find((member) => member.connectionId === room.roleplay?.gmConnectionId) ?? enabledMembers[0]!;
  const actors = room.roleplay.includeAllAgents === false
    ? []
    : enabledMembers.filter((member) => member.connectionId !== gm.connectionId);
  return [gm, ...actors];
}

export function buildRoleplayTurnPrompt(room: Room, rawText: string): string {
  const config = room.roleplay ?? makeDefaultRoleplayConfig(room.members.find((member) => member.enabled)?.connectionId);
  const command = parseRoleplayCommand(rawText);
  const text = command?.topic || rawText.trim() || '继续推进当前场景。';

  if (command?.id === 'scene') {
    return [
      '【角色扮演：场景设定更新】',
      `玩家希望更新或强调当前场景：${text}`,
      '请主 GM 将这个设定自然融入接下来的剧情推进；其他 Agent 按自己的角色理解场景，但不要推翻主叙事。',
    ].join('\n');
  }

  if (command?.id === 'ooc') {
    return [
      '【角色扮演：场外讨论 OOC】',
      `玩家场外说明：${text}`,
      '请暂时跳出角色，以简短、清晰的方式协助调整规则、节奏、边界或体验。处理完后可以提示如何回到剧情。',
    ].join('\n');
  }

  if (command?.id === 'rp') {
    return [
      '【角色扮演回合】',
      `玩家发起或继续一次桌游店式角色扮演：${text}`,
      '请进入 RP 房间模式。主 GM 负责推进剧情；其他 Agent 扮演角色、NPC、队友、旁白碎片或氛围补充。',
      '',
      buildRoleplayConfigPrompt(config),
    ].join('\n');
  }

  return [
    '【角色扮演回合】',
    `玩家行动 / 台词 / 意图：${rawText.trim() || '继续'}`,
    '请根据 RP 房间设定继续推进。主 GM 先给出场景与后果，其他 Agent 再以自己的角色补充互动。',
    '',
    buildRoleplayConfigPrompt(config),
  ].join('\n');
}

export function buildRoleplaySystemAppendix(room: Room, member: RoomMember): string {
  const config = room.roleplay;
  if (!config?.enabled) return '';
  const gmId = config.gmConnectionId || room.members.find((item) => item.enabled)?.connectionId;
  const isGm = member.connectionId === gmId;
  const gmAlias = room.members.find((item) => item.connectionId === gmId)?.alias ?? '主 Agent';
  return [
    '',
    'Laphiny RP 房间模式：',
    '- 模式：桌游店式多人角色扮演。',
    `- 主持 / GM：${gmAlias}${isGm ? '（你）' : ''}`,
    `- 玩家称呼：${config.playerName || '玩家'}`,
    `- 类型：${config.genre || '未设定'}`,
    `- 基调：${config.tone || '未设定'}`,
    `- 剧情前提：${config.premise || '未设定'}`,
    config.currentScene ? `- 当前场景：${config.currentScene}` : '- 当前场景：由 GM 根据上下文推进。',
    config.archive ? `- 剧本档案：第 ${config.archive.chapter} 章，${config.archive.currentQuest}` : '- 剧本档案：尚未整理。',
    '',
    '你的 RP 职责：',
    ...(isGm ? [
      '1. 你是本房间的主叙事 / GM，负责场景描述、节奏控制、冲突推进、NPC 调度和回合收束。',
      '2. 给玩家明确可行动的选择或钩子，但不要代替玩家做决定。',
      '3. 可以邀请其他 Agent 扮演 NPC、队友或氛围补充，但不要把剧情推进权完全交出去。',
      '4. 保持桌游店主持人的节奏：描述现状 → 呈现变化/风险 → 询问玩家行动。',
    ] : [
      `1. ${gmAlias} 是 GM；你不要抢夺主叙事权。`,
      '2. 你可以扮演自己的角色、临时 NPC、队友、旁白碎片、环境细节或内心反应。',
      '3. 补充要短而有戏剧性，优先回应 GM 已经建立的场景。',
      '4. 不要替玩家做决定，不要推翻 GM 刚刚确定的事实。',
    ]),
    '5. RP 过程中依然保持你的 Hermes soul / 人格风格，但要服从房间共同设定。',
    '6. 涉及边界、规则或节奏调整时，可以使用 OOC 简短说明。',
  ].join('\n');
}

export function summarizeRoleplayConfig(config?: RoleplayConfig): string {
  if (!config?.enabled) return '未开启 RP 模式';
  return `${config.genre || '未设定类型'} · ${config.tone || '未设定基调'} · ${config.includeAllAgents === false ? '仅 GM 推进' : '全员入戏'}`;
}

function buildRoleplayConfigPrompt(config: RoleplayConfig): string {
  return [
    '当前 RP 房间设定：',
    `- 玩家称呼：${config.playerName || '玩家'}`,
    `- 类型：${config.genre || '未设定'}`,
    `- 基调：${config.tone || '未设定'}`,
    `- 剧情前提：${config.premise || '未设定'}`,
    config.currentScene ? `- 当前场景：${config.currentScene}` : '- 当前场景：由 GM 根据上下文推进。',
    config.archive ? `- 剧本档案：第 ${config.archive.chapter} 章，${config.archive.currentQuest}` : '- 剧本档案：尚未整理。',
    '',
    '输出要求：',
    '1. 不要替玩家做关键决定。',
    '2. GM 给出画面、变化、风险、钩子和可选行动。',
    '3. 非 GM 用角色反应、NPC、环境细节或旁白碎片补充，不抢主线。',
  ].join('\n');
}
