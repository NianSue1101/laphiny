import type { Room, RoomBlackboardItem, RoomDecisionRecord, RoomKnowledgeItem, RoomMemoryCapsule } from '../types';

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

export function getRoomGrowthLevelLabel(level: RoomGrowthSummary['level']): string {
  if (level === 'evolving') return '持续成长';
  if (level === 'settled') return '形成稳定协作';
  if (level === 'forming') return '正在成形';
  return '刚被召集';
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
