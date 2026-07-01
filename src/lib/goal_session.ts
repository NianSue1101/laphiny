import type {
  GoalSession,
  GoalStatusSignal,
  Room,
  RoomMember,
  RoomMemoryCapsule,
} from '../types';

function makeRuntimeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeGoalSession(
  roomId: string,
  goal: string,
  leadMember: RoomMember,
  now: string,
  sourceMessageId?: string,
): GoalSession {
  return {
    id: makeRuntimeId('goal'),
    roomId,
    goal: goal || '未命名目标',
    leadConnectionId: leadMember.connectionId,
    leadAlias: leadMember.alias,
    round: 1,
    status: 'running',
    planItems: [],
    lastMessageId: sourceMessageId,
    createdAt: now,
    updatedAt: now,
  };
}

export function getGoalControlCommand(room: Room, rawText: string): { type: 'continue' | 'finish' } | null {
  const activeGoal = room.activeGoal;
  if (!activeGoal || activeGoal.status !== 'awaiting_user') return null;

  const normalized = rawText.trim().toLowerCase();
  if (!normalized) return null;
  if (['继续', '繼續', 'continue', '/goal-continue'].includes(normalized)) return { type: 'continue' };
  if (['结束', '完成', '結束', 'finish', 'end', '/goal-finish', '/goal-end'].includes(normalized)) return { type: 'finish' };
  return null;
}

export function getActiveGoalLeadMember(room: Room): RoomMember | undefined {
  const activeGoal = room.activeGoal;
  if (!activeGoal) return undefined;
  return room.members.find((member) => member.enabled && member.connectionId === activeGoal.leadConnectionId)
    ?? room.members.find((member) => member.enabled && member.alias === activeGoal.leadAlias)
    ?? room.members.find((member) => member.enabled);
}

export function getGoalStatusFromSignal(signal: GoalStatusSignal | null): GoalSession['status'] {
  if (signal === 'done' || signal === 'blocked') return 'awaiting_user';
  if (signal === 'continue') return 'running';
  return 'reviewing';
}

export function mergeGoalPlanItems(
  current: GoalSession['planItems'],
  incoming: GoalSession['planItems'],
): GoalSession['planItems'] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = byId.get(item.id);
    byId.set(item.id, existing ? { ...existing, ...item } : item);
  }
  return Array.from(byId.values());
}

export function buildGoalMemoryCapsule(room: Room, goal: GoalSession, now: string): RoomMemoryCapsule {
  const previous = room.memoryCapsule;
  const doneItems = goal.planItems.filter((item) => item.status === 'done').map((item) => item.title);
  const remainingItems = goal.planItems
    .filter((item) => item.status !== 'done')
    .map((item) => `${item.title}${item.ownerAlias ? `（${item.ownerAlias}）` : ''}`);

  return {
    id: previous?.id ?? makeRuntimeId('memory'),
    roomId: room.id,
    goal: goal.goal,
    decisions: uniqueStrings([
      ...(previous?.decisions ?? []),
      `${goal.status === 'blocked' ? '目标暂停/受阻' : '目标完成'}：${goal.goal}`,
      ...doneItems.map((item) => `完成：${item}`),
    ]).slice(-12),
    todos: uniqueStrings([
      ...remainingItems,
      ...(previous?.todos ?? []),
    ]).slice(0, 12),
    preferences: previous?.preferences ?? [],
    openQuestions: uniqueStrings([
      ...(goal.status === 'blocked' ? ['目标受阻，需要用户确认下一步。'] : []),
      ...(previous?.openQuestions ?? []),
    ]).slice(0, 12),
    handoffNotes: goal.lastReview || previous?.handoffNotes,
    source: 'agent-generated',
    authorName: goal.leadAlias,
    version: (previous?.version ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
