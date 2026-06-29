import type { Room, RoomBlackboardItem, RoomBlackboardItemStatus, RoomDecisionRecord, RoomKnowledgeItem, RoomMemoryCapsule } from '../types';

type IdFactory = (prefix: string) => string;

export interface RoomGrowthSummary {
  knowledgeCount: number;
  blackboardOpenCount: number;
  decisionCount: number;
  pendingMemory: boolean;
  level: 'seed' | 'forming' | 'settled' | 'evolving';
  label: string;
}

export function summarizeRoomGrowth(room: Room): RoomGrowthSummary {
  const knowledgeCount = room.knowledgeBase?.length ?? 0;
  const blackboardOpenCount = room.blackboardItems?.filter((item) => item.status !== 'resolved').length ?? 0;
  const decisionCount = room.decisionRecords?.filter((item) => item.status === 'active').length ?? 0;
  const memoryVersions = room.memoryCapsule?.version ?? 0;
  const score = knowledgeCount + blackboardOpenCount + decisionCount + memoryVersions;
  const level = score >= 12 ? 'evolving' : score >= 6 ? 'settled' : score >= 2 ? 'forming' : 'seed';
  return {
    knowledgeCount,
    blackboardOpenCount,
    decisionCount,
    pendingMemory: Boolean(room.pendingMemoryCapsule),
    level,
    label: getRoomGrowthLevelLabel(level),
  };
}

export function formatRoomGrowthForPrompt(room: Room): string {
  const knowledge = (room.knowledgeBase ?? [])
    .slice(-8)
    .map((item) => `- ${item.title}：${item.body}${item.tags.length ? `（${item.tags.join('、')}）` : ''}`);
  const blackboard = (room.blackboardItems ?? [])
    .filter((item) => item.status !== 'resolved')
    .slice(-8)
    .map((item) => `- ${item.status === 'pinned' ? '置顶' : '待处理'}：${item.text}`);
  const decisions = (room.decisionRecords ?? [])
    .filter((item) => item.status === 'active')
    .slice(-8)
    .map((item) => `- ${item.title}${item.rationale ? `：${item.rationale}` : ''}`);

  if (!knowledge.length && !blackboard.length && !decisions.length) {
    return '当前房间还没有结构化知识库、协作黑板或决策记录。请优先参考共享聊天记录。';
  }

  return [
    '房间知识库：',
    knowledge.length ? knowledge.join('\n') : '- 暂无',
    '',
    '协作黑板：',
    blackboard.length ? blackboard.join('\n') : '- 暂无开放事项',
    '',
    '决策记录：',
    decisions.length ? decisions.join('\n') : '- 暂无稳定决策',
  ].join('\n');
}

export function applyMemoryCapsuleToRoomGrowth(
  room: Room,
  capsule: RoomMemoryCapsule,
  now: string,
  makeId: IdFactory,
): Pick<Room, 'knowledgeBase' | 'blackboardItems' | 'decisionRecords'> {
  const knowledgeBase = [...(room.knowledgeBase ?? [])];
  const blackboardItems = [...(room.blackboardItems ?? [])];
  const decisionRecords = [...(room.decisionRecords ?? [])];

  addKnowledge(knowledgeBase, {
    id: makeId('knowledge'),
    title: '房间长期目标',
    body: capsule.goal,
    tags: ['goal', 'memory'],
    source: 'memory',
    createdAt: now,
    updatedAt: now,
  });

  for (const preference of capsule.preferences) {
    addKnowledge(knowledgeBase, {
      id: makeId('knowledge'),
      title: preference.slice(0, 36),
      body: preference,
      tags: ['preference', 'memory'],
      source: 'memory',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (capsule.handoffNotes) {
    addKnowledge(knowledgeBase, {
      id: makeId('knowledge'),
      title: '交接提示',
      body: capsule.handoffNotes,
      tags: ['handoff', 'memory'],
      source: 'memory',
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const decision of capsule.decisions) {
    addDecision(decisionRecords, {
      id: makeId('decision'),
      title: decision.slice(0, 80),
      rationale: decision,
      ownerName: capsule.authorName,
      source: 'memory',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const todo of capsule.todos) {
    addBlackboardItem(blackboardItems, {
      id: makeId('blackboard'),
      text: todo,
      authorName: capsule.authorName ?? 'Laphiny',
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const question of capsule.openQuestions) {
    addBlackboardItem(blackboardItems, {
      id: makeId('blackboard'),
      text: `未解决：${question}`,
      authorName: capsule.authorName ?? 'Laphiny',
      status: 'pinned',
      createdAt: now,
      updatedAt: now,
    });
  }

  return {
    knowledgeBase: knowledgeBase.slice(-80),
    blackboardItems: blackboardItems.slice(-120),
    decisionRecords: decisionRecords.slice(-80),
  };
}

export interface RoomStatePatchApplication {
  patch: Pick<Room, 'knowledgeBase' | 'blackboardItems' | 'decisionRecords'>;
  counts: {
    knowledge: number;
    blackboard: number;
    decisions: number;
    resolvedBlackboard: number;
  };
}

export function formatRoomStatePatchProtocolPrompt(): string {
  return [
    '房间状态写入接口：',
    '当你在协作中形成了可沉淀的结论、待办或决策时，可以在回复末尾附带一个 JSON 代码块：```laphiny-room-state ... ```。',
    'Laphiny 会解析该代码块并写入当前房间的知识库、协作黑板和决策记录，帮助房间真正向目标前进。',
    '格式示例：',
    '```laphiny-room-state',
    '{',
    '  "knowledge": [{ "title": "稳定事实", "body": "已确认的信息", "tags": ["fact"] }],',
    '  "blackboard": [{ "text": "下一步要做的事项", "status": "open" }],',
    '  "decisions": [{ "title": "已达成的决策", "rationale": "为什么这样定", "ownerName": "负责人" }],',
    '  "resolveBlackboard": ["已经解决的旧事项关键词"]',
    '}',
    '```',
    '只写你有把握、可追溯、能帮助房间推进的内容；不要把闲聊、猜测或重复内容写入长期状态。',
  ].join('\n');
}

export function applyRoomStatePatchFromText(
  room: Room,
  text: string,
  authorName: string,
  now: string,
  makeId: IdFactory,
): RoomStatePatchApplication | null {
  const blocks = extractRoomStatePatchBlocks(text);
  if (blocks.length === 0) return null;

  const knowledgeBase = [...(room.knowledgeBase ?? [])];
  const blackboardItems = [...(room.blackboardItems ?? [])];
  const decisionRecords = [...(room.decisionRecords ?? [])];
  const counts = { knowledge: 0, blackboard: 0, decisions: 0, resolvedBlackboard: 0 };

  for (const block of blocks) {
    const parsed = safeParsePatch(block);
    if (!parsed) continue;

    for (const item of normalizeArray(parsed.knowledge)) {
      const title = normalizePatchText(item.title).slice(0, 80);
      const body = normalizePatchText(item.body || item.content).slice(0, 2000);
      if (!title || !body) continue;
      const before = knowledgeBase.length;
      addKnowledge(knowledgeBase, {
        id: makeId('knowledge'),
        title,
        body,
        tags: normalizeStringArray(item.tags).slice(0, 8),
        source: 'summary',
        createdAt: now,
        updatedAt: now,
      });
      if (knowledgeBase.length > before) counts.knowledge += 1;
    }

    for (const item of normalizeArray(parsed.blackboard)) {
      const text = normalizePatchText(item.text || item.body || item.title).slice(0, 1000);
      if (!text) continue;
      const before = blackboardItems.length;
      addBlackboardItem(blackboardItems, {
        id: makeId('blackboard'),
        text,
        authorName: normalizePatchText(item.authorName) || authorName,
        status: normalizeBlackboardStatus(item.status),
        createdAt: now,
        updatedAt: now,
      });
      if (blackboardItems.length > before) counts.blackboard += 1;
    }

    for (const item of normalizeArray(parsed.decisions)) {
      const title = normalizePatchText(item.title || item.decision).slice(0, 120);
      if (!title) continue;
      const before = decisionRecords.length;
      addDecision(decisionRecords, {
        id: makeId('decision'),
        title,
        rationale: normalizePatchText(item.rationale || item.reason || item.context).slice(0, 1200) || undefined,
        ownerName: normalizePatchText(item.ownerName || item.owner).slice(0, 80) || authorName,
        source: 'goal',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      if (decisionRecords.length > before) counts.decisions += 1;
    }

    for (const keyword of normalizeStringArray(parsed.resolveBlackboard)) {
      const normalizedKeyword = normalizeKey(keyword);
      if (!normalizedKeyword) continue;
      for (let index = 0; index < blackboardItems.length; index += 1) {
        const item = blackboardItems[index];
        if (!item || item.status === 'resolved') continue;
        if (normalizeKey(item.text).includes(normalizedKeyword)) {
          blackboardItems[index] = { ...item, status: 'resolved', updatedAt: now };
          counts.resolvedBlackboard += 1;
        }
      }
    }
  }

  if (counts.knowledge + counts.blackboard + counts.decisions + counts.resolvedBlackboard === 0) return null;

  return {
    patch: {
      knowledgeBase: knowledgeBase.slice(-100),
      blackboardItems: blackboardItems.slice(-140),
      decisionRecords: decisionRecords.slice(-100),
    },
    counts,
  };
}

export function stripRoomStatePatchBlocks(text: string): string {
  return text.replace(/```laphiny-room-state\s*\n[\s\S]*?```/gi, '').trim();
}

export function getRoomGrowthLevelLabel(level: RoomGrowthSummary['level']): string {
  if (level === 'evolving') return '持续成长';
  if (level === 'settled') return '形成稳定协作';
  if (level === 'forming') return '正在成形';
  return '刚被召集';
}

function extractRoomStatePatchBlocks(text: string): string[] {
  const blocks: string[] = [];
  const pattern = /```laphiny-room-state\s*\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]?.trim()) blocks.push(match[1].trim());
  }
  return blocks;
}

function safeParsePatch(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function normalizeArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePatchText).filter(Boolean);
}

function normalizePatchText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function normalizeBlackboardStatus(value: unknown): RoomBlackboardItemStatus {
  const status = normalizePatchText(value).toLowerCase();
  if (status === 'pinned' || status === 'resolved') return status;
  return 'open';
}

function addKnowledge(items: RoomKnowledgeItem[], item: RoomKnowledgeItem): void {
  const key = normalizeKey(`${item.title}:${item.body}`);
  if (items.some((current) => normalizeKey(`${current.title}:${current.body}`) === key)) return;
  items.push(item);
}

function addBlackboardItem(items: RoomBlackboardItem[], item: RoomBlackboardItem): void {
  const key = normalizeKey(item.text);
  if (items.some((current) => normalizeKey(current.text) === key && current.status !== 'resolved')) return;
  items.push(item);
}

function addDecision(items: RoomDecisionRecord[], item: RoomDecisionRecord): void {
  const key = normalizeKey(item.title);
  if (items.some((current) => normalizeKey(current.title) === key && current.status === 'active')) return;
  items.push(item);
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}
