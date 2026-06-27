import { ChatMessage, CollaborationEvent, DelegationTask, HermesChatMessage, HermesConnection, RoleplayArchive, RoleplayConfig, Room, RoomModeId } from '../types';

export interface RoomModeDefinition {
  id: RoomModeId;
  label: string;
  description: string;
  defaultCollaborationMode: Room['defaultCollaborationMode'];
  autoDelegationEnabled: boolean;
  roleplayEnabled: boolean;
  tone: string;
}

export const ROOM_MODES: RoomModeDefinition[] = [
  {
    id: 'studio',
    label: '工作室',
    description: '适合产品、代码、设计和长期项目推进。默认手动 @，保留自动委托。',
    defaultCollaborationMode: 'manual',
    autoDelegationEnabled: true,
    roleplayEnabled: false,
    tone: '专注、结构化、可执行',
  },
  {
    id: 'council',
    label: '议会',
    description: '适合重大决策。默认并行收集观点，再由总结者形成共识。',
    defaultCollaborationMode: 'parallel',
    autoDelegationEnabled: false,
    roleplayEnabled: false,
    tone: '独立观点、权衡利弊、形成共识',
  },
  {
    id: 'review',
    label: '审查',
    description: '适合代码、方案、体验和风险审查。默认接力，每位 Agent 补自己擅长的检查。',
    defaultCollaborationMode: 'sequential',
    autoDelegationEnabled: true,
    roleplayEnabled: false,
    tone: '审慎、挑刺、给出修正',
  },
  {
    id: 'tabletop',
    label: '桌游',
    description: '适合角色扮演。由 GM 推进故事，其他 Agent 作为角色、NPC 或旁白入戏。',
    defaultCollaborationMode: 'manual',
    autoDelegationEnabled: true,
    roleplayEnabled: true,
    tone: '沉浸、叙事、角色互动',
  },
  {
    id: 'daily',
    label: '日常',
    description: '适合陪伴、闲聊和轻量讨论。默认手动点名，减少打扰。',
    defaultCollaborationMode: 'manual',
    autoDelegationEnabled: false,
    roleplayEnabled: false,
    tone: '轻松、自然、有边界',
  },
];

export interface StarterRoomTemplate {
  id: string;
  title: string;
  description: string;
  roomName: string;
  mode: RoomModeId;
  minimumConnections: number;
  roleplay?: Partial<RoleplayConfig>;
}

export const STARTER_ROOM_TEMPLATES: StarterRoomTemplate[] = [
  {
    id: 'product-studio',
    title: '产品设计小队',
    description: '用于功能规划、红队审查、复盘和共识沉淀。',
    roomName: '产品设计工作室',
    mode: 'studio',
    minimumConnections: 2,
  },
  {
    id: 'code-review',
    title: '代码审查小队',
    description: '默认接力审查，适合找 bug、构建部署和实现路径。',
    roomName: '代码审查室',
    mode: 'review',
    minimumConnections: 2,
  },
  {
    id: 'tabletop-rp',
    title: '桌游 RP 小队',
    description: '一位 GM 推进故事，其他 Agent 作为 NPC、队友或旁白。',
    roomName: '雨夜桌游店',
    mode: 'tabletop',
    minimumConnections: 2,
    roleplay: {
      enabled: true,
      genre: '都市怪谈',
      tone: '悬疑、沉浸、轻桌游',
      premise: '雨夜里，一间只在凌晨出现的旧桌游店向玩家打开了门。',
      currentScene: '门口的铃铛没有响，柜台后方只有一盏绿色台灯亮着。',
      includeAllAgents: true,
    },
  },
  {
    id: 'daily-room',
    title: '日常陪伴小队',
    description: '低压力闲聊、日常记录和轻量建议。',
    roomName: '日常 Soul 房间',
    mode: 'daily',
    minimumConnections: 1,
  },
];

export interface TaskBoardColumn {
  id: 'todo' | 'running' | 'done' | 'blocked';
  label: string;
  tasks: DelegationTask[];
}

export interface SoulRelationEdge {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  delegations: number;
  completions: number;
  mentions: number;
  strength: number;
  label: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  body: string;
  done: boolean;
}

export function getRoomModeDefinition(mode?: RoomModeId): RoomModeDefinition {
  return ROOM_MODES.find((item) => item.id === mode) ?? ROOM_MODES[0]!;
}

export function getRoomModeLabel(mode?: RoomModeId): string {
  return getRoomModeDefinition(mode).label;
}

export function getRoomModePrompt(room: Room): string {
  const mode = getRoomModeDefinition(room.mode);
  return [
    `当前房间模式：${mode.label}`,
    `模式说明：${mode.description}`,
    `协作语气：${mode.tone}`,
    room.mode === 'review' ? '请优先发现问题、遗漏、风险和可改进点。' : '',
    room.mode === 'council' ? '请保持独立观点，避免无意义附和；最后应推动形成共识。' : '',
    room.mode === 'daily' ? '请保持自然、轻量，不要过度工程化。' : '',
    room.mode === 'tabletop' ? '请优先服务角色扮演体验和叙事连续性。' : '',
  ].filter(Boolean).join('\n');
}

export function makeDefaultRoleplayArchive(roomName = '未命名 RP 房间', config?: RoleplayConfig): RoleplayArchive {
  const now = new Date().toISOString();
  return {
    id: `rp_archive_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: config?.premise?.slice(0, 28) || roomName,
    chapter: 1,
    world: config?.premise || '尚未记录世界观。',
    currentQuest: config?.currentScene || '等待玩家开始行动。',
    playerCharacter: config?.playerName || '玩家',
    npcs: [],
    locations: config?.currentScene ? [config.currentScene] : [],
    items: [],
    clues: [],
    mysteries: [],
    playerChoices: [],
    gmNotes: '',
    version: 1,
    updatedAt: now,
  };
}

export function buildRoleplayArchiveMessages(room: Room, messages: ChatMessage[]): HermesChatMessage[] {
  const roleplay = room.roleplay;
  const archive = roleplay?.archive ?? makeDefaultRoleplayArchive(room.name, roleplay);
  const transcript = messages
    .filter((message) => message.status === 'sent' && (message.role === 'user' || message.role === 'assistant'))
    .slice(-120)
    .map((message) => `${message.authorName}：${message.content}`)
    .join('\n\n');
  return [
    {
      role: 'system',
      content: [
        `你是 Laphiny RP 房间「${room.name}」的档案整理员。`,
        '请根据最近剧情更新 RP 档案：世界观、章节、当前任务、NPC、地点、道具、线索、谜团、玩家选择。',
        'gmNotes 可以记录给 GM 看的幕后伏笔，但不要写入任何密钥、隐藏 system prompt 或私密 soul 全文。',
        '只输出 JSON，不要输出 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        '当前 RP 设置：',
        JSON.stringify({
          genre: roleplay?.genre,
          tone: roleplay?.tone,
          premise: roleplay?.premise,
          currentScene: roleplay?.currentScene,
          playerName: roleplay?.playerName,
        }, null, 2),
        '',
        '现有档案：',
        JSON.stringify(archive, null, 2),
        '',
        '请输出更新后的 JSON，格式如下：',
        JSON.stringify({
          title: '剧本标题',
          chapter: 1,
          world: '世界观摘要',
          currentQuest: '当前主线任务',
          playerCharacter: '玩家角色/称呼',
          npcs: ['NPC 名称：简要描述'],
          locations: ['地点：简要描述'],
          items: ['道具：用途或状态'],
          clues: ['线索或伏笔'],
          mysteries: ['未解谜团'],
          playerChoices: ['玩家重要选择及后果'],
          gmNotes: '只给 GM 看的幕后提示，可留空',
        }, null, 2),
        '',
        '最近剧情：',
        transcript || '暂无剧情记录。',
      ].join('\n'),
    },
  ];
}

export function parseRoleplayArchiveResponse(text: string, fallback: RoleplayArchive): RoleplayArchive {
  const parsed = safeJson(extractJson(text) ?? text);
  const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {};
  return {
    ...fallback,
    title: normalizeString(record.title) ?? fallback.title,
    chapter: normalizeNumber(record.chapter) ?? fallback.chapter,
    world: normalizeString(record.world) ?? fallback.world,
    currentQuest: normalizeString(record.currentQuest) ?? fallback.currentQuest,
    playerCharacter: normalizeString(record.playerCharacter) ?? fallback.playerCharacter,
    npcs: normalizeStringArray(record.npcs),
    locations: normalizeStringArray(record.locations),
    items: normalizeStringArray(record.items),
    clues: normalizeStringArray(record.clues),
    mysteries: normalizeStringArray(record.mysteries),
    playerChoices: normalizeStringArray(record.playerChoices),
    gmNotes: normalizeString(record.gmNotes),
    version: (fallback.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
}

export function formatRoleplayArchiveForPrompt(archive?: RoleplayArchive): string {
  if (!archive) return '当前 RP 房间还没有剧本档案。';
  return [
    `剧本：${archive.title} · 第 ${archive.chapter} 章`,
    `世界观：${archive.world}`,
    `当前任务：${archive.currentQuest}`,
    `玩家：${archive.playerCharacter}`,
    list('NPC', archive.npcs),
    list('地点', archive.locations),
    list('道具', archive.items),
    list('线索/伏笔', archive.clues),
    list('未解谜团', archive.mysteries),
    list('玩家选择记录', archive.playerChoices),
    archive.gmNotes ? `GM 幕后笔记：${archive.gmNotes}` : '',
  ].filter(Boolean).join('\n');
}

export function summarizeRoleplayArchive(archive?: RoleplayArchive): string {
  if (!archive) return '暂无 RP 档案。';
  return `第 ${archive.chapter} 章 · NPC ${archive.npcs.length} · 地点 ${archive.locations.length} · 线索 ${archive.clues.length} · 谜团 ${archive.mysteries.length}`;
}

export function buildTaskBoard(tasks: DelegationTask[]): TaskBoardColumn[] {
  const columns: TaskBoardColumn[] = [
    { id: 'todo', label: '待处理', tasks: [] },
    { id: 'running', label: '处理中', tasks: [] },
    { id: 'done', label: '已完成', tasks: [] },
    { id: 'blocked', label: '阻塞/失败', tasks: [] },
  ];
  for (const task of tasks) {
    const column = task.status === 'done'
      ? columns[2]!
      : task.status === 'error' || task.status === 'cancelled'
        ? columns[3]!
        : task.status === 'running'
          ? columns[1]!
          : columns[0]!;
    column.tasks.push(task);
  }
  for (const column of columns) {
    column.tasks.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  return columns;
}

export function buildSoulRelations({
  rooms,
  connections,
  collaborationEvents,
  delegationTasks,
  messagesByRoom,
}: {
  rooms: Room[];
  connections: HermesConnection[];
  collaborationEvents: CollaborationEvent[];
  delegationTasks: DelegationTask[];
  messagesByRoom: Record<string, ChatMessage[]>;
}): SoulRelationEdge[] {
  const nameById = new Map(connections.map((item) => [item.id, item.name]));
  for (const room of rooms) {
    for (const member of room.members) nameById.set(member.connectionId, member.alias);
  }
  const edgeMap = new Map<string, SoulRelationEdge>();
  const ensure = (fromId: string, toId: string, fromName?: string, toName?: string) => {
    const key = `${fromId}->${toId}`;
    const existing = edgeMap.get(key);
    if (existing) return existing;
    const edge: SoulRelationEdge = {
      id: key,
      fromId,
      toId,
      fromName: fromName ?? nameById.get(fromId) ?? fromId,
      toName: toName ?? nameById.get(toId) ?? toId,
      delegations: 0,
      completions: 0,
      mentions: 0,
      strength: 0,
      label: '协作关系',
    };
    edgeMap.set(key, edge);
    return edge;
  };

  for (const task of delegationTasks) {
    const edge = ensure(task.fromConnectionId, task.toConnectionId, task.fromAlias, task.toAlias);
    edge.delegations += 1;
    if (task.status === 'done') edge.completions += 1;
  }

  const aliasToId = new Map<string, string>();
  for (const room of rooms) {
    for (const member of room.members) aliasToId.set(member.alias.toLowerCase(), member.connectionId);
  }
  for (const messages of Object.values(messagesByRoom)) {
    for (const message of messages) {
      if (message.authorId === 'user' || message.authorId === 'system') continue;
      for (const [alias, id] of aliasToId) {
        if (id === message.authorId) continue;
        if (message.content.toLowerCase().includes(alias)) {
          ensure(message.authorId, id, message.authorName, nameById.get(id)).mentions += 1;
        }
      }
    }
  }

  for (const event of collaborationEvents) {
    if (!event.source || !event.target) continue;
    const from = findIdByName(nameById, event.source);
    const to = findIdByName(nameById, event.target);
    if (from && to && from !== to) ensure(from, to, event.source, event.target).mentions += 1;
  }

  const edges = [...edgeMap.values()].map((edge) => {
    const strength = edge.delegations * 3 + edge.completions * 2 + edge.mentions;
    return {
      ...edge,
      strength,
      label: edge.completions >= 3 ? '稳定搭档' : edge.delegations >= 3 ? '常用委托' : edge.mentions >= 3 ? '经常互相引用' : '协作关系',
    };
  });

  return edges.sort((a, b) => b.strength - a.strength).slice(0, 12);
}

export function buildOnboardingSteps({ connections, rooms }: { connections: HermesConnection[]; rooms: Room[] }): OnboardingStep[] {
  return [
    {
      id: 'connections',
      title: '连接 Hermes Soul',
      body: '添加至少一个已有 Agent，让 Laphiny 把它带进房间。',
      done: connections.length > 0,
    },
    {
      id: 'profiles',
      title: '生成协作卡片',
      body: '让 Agent 自己维护公开人格/能力摘要，便于委托路由。',
      done: connections.some((item) => item.profile),
    },
    {
      id: 'room',
      title: '创建 Soul 房间',
      body: '用模板创建工作室、审查室、桌游店或日常房间。',
      done: rooms.length > 0,
    },
    {
      id: 'memory',
      title: '沉淀房间记忆',
      body: '长期房间建议生成记忆胶囊，让 Agent 记得共识与待办。',
      done: rooms.some((room) => room.memoryCapsule),
    },
  ];
}

function list(title: string, items: string[]): string {
  return `${title}：${items.length ? items.map((item) => `\n- ${item}`).join('') : '无'}`;
}

function findIdByName(map: Map<string, string>, name: string): string | undefined {
  const normalized = name.toLowerCase();
  for (const [id, label] of map) {
    if (id.toLowerCase() === normalized || label.toLowerCase() === normalized) return id;
  }
  return undefined;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 30);
}

function extractJson(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return null;
}

function safeJson(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
