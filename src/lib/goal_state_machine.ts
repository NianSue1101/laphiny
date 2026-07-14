import type {
  DelegationTask,
  GoalAcceptanceCriterion,
  GoalEvidence,
  GoalPlanItem,
  GoalReviewRecord,
  GoalSession,
  GoalSessionStatus,
  GoalStatusSignal,
} from '../types';
import { mergeGoalPlanItems } from './goal_session';

const TERMINAL_STATUSES = new Set<GoalSessionStatus>(['done', 'blocked', 'cancelled']);
const ALLOWED_TRANSITIONS: Record<GoalSessionStatus, GoalSessionStatus[]> = {
  planning: ['running', 'reviewing', 'adjusting', 'awaiting_user', 'done', 'blocked', 'cancelled'],
  running: ['reviewing', 'adjusting', 'awaiting_user', 'done', 'blocked', 'cancelled'],
  reviewing: ['running', 'adjusting', 'awaiting_user', 'done', 'blocked', 'cancelled'],
  adjusting: ['running', 'reviewing', 'awaiting_user', 'done', 'blocked', 'cancelled'],
  awaiting_user: ['running', 'adjusting', 'done', 'blocked', 'cancelled'],
  done: ['adjusting'],
  blocked: ['adjusting', 'running', 'cancelled'],
  cancelled: ['adjusting'],
};

export type GoalAssistantReviewInput = {
  signal: GoalStatusSignal | null;
  planItems: GoalPlanItem[];
  evidence?: GoalEvidence[];
  messageId: string;
  conclusion: string;
  round: number;
  now: string;
};

export function canTransitionGoalSession(from: GoalSessionStatus, to: GoalSessionStatus): boolean {
  return from === to || ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionGoalSession(
  goal: GoalSession,
  nextStatus: GoalSessionStatus,
  now: string,
  patch: Partial<GoalSession> = {},
): GoalSession {
  if (!canTransitionGoalSession(goal.status, nextStatus)) {
    throw new Error(`非法目标状态转换：${goal.status} → ${nextStatus}`);
  }
  return {
    ...goal,
    ...patch,
    status: nextStatus,
    updatedAt: now,
    completedAt: TERMINAL_STATUSES.has(nextStatus) ? patch.completedAt ?? now : undefined,
  };
}

export function normalizeGoalSession(goal: GoalSession): GoalSession {
  return {
    ...goal,
    acceptanceCriteria: Array.isArray(goal.acceptanceCriteria) ? goal.acceptanceCriteria : [],
    evidence: Array.isArray(goal.evidence) ? goal.evidence : [],
    reviewHistory: Array.isArray(goal.reviewHistory) ? goal.reviewHistory : [],
    maxRounds: Number.isInteger(goal.maxRounds) && goal.maxRounds > 0 ? goal.maxRounds : 5,
    noProgressRounds: Number.isInteger(goal.noProgressRounds) && goal.noProgressRounds >= 0 ? goal.noProgressRounds : 0,
  };
}

export function applyGoalAssistantReview(goalInput: GoalSession, input: GoalAssistantReviewInput): GoalSession {
  const goal = normalizeGoalSession(goalInput);
  const planItems = input.planItems.length ? mergeGoalPlanItems(goal.planItems, input.planItems) : goal.planItems;
  const evidence = mergeGoalEvidence(goal.evidence, input.evidence ?? []);
  const acceptanceCriteria = deriveAcceptanceCriteria(goal.acceptanceCriteria, planItems, evidence, input.now);
  const progressFingerprint = makeGoalProgressFingerprint(planItems, acceptanceCriteria);
  const noProgressRounds = goal.progressFingerprint === progressFingerprint ? goal.noProgressRounds + 1 : 0;
  const completionSupported = isGoalCompletionSupported(planItems, acceptanceCriteria);

  let nextStatus: GoalSessionStatus;
  let nextAction: string | undefined;
  let blockedReason: string | undefined;
  if (input.signal === 'blocked') {
    nextStatus = 'blocked';
    blockedReason = compactConclusion(input.conclusion);
  } else if (input.signal === 'done' && completionSupported) {
    nextStatus = 'done';
  } else if (input.signal === 'done') {
    nextStatus = 'adjusting';
    nextAction = 'Agent 报告完成，但仍有未通过的验收条件；继续补齐证据或计划项。';
  } else if (input.signal === 'continue') {
    nextStatus = planItems.some((item) => item.status === 'todo' || item.status === 'running') ? 'running' : 'adjusting';
    nextAction = '继续执行未完成计划项，并在下一轮对照验收条件复核。';
  } else {
    nextStatus = 'reviewing';
    nextAction = '等待主 Agent 给出结构化状态与验收结论。';
  }

  if (!TERMINAL_STATUSES.has(nextStatus) && (input.round >= goal.maxRounds || noProgressRounds >= 2)) {
    nextStatus = 'awaiting_user';
    blockedReason = input.round >= goal.maxRounds
      ? `已达到 ${goal.maxRounds} 轮安全上限。`
      : '连续两轮计划与验收状态没有进展。';
    nextAction = '请用户调整目标、补充信息或确认继续增加迭代轮次。';
  }

  const reviewEvidenceIds = evidence.slice(goal.evidence.length).map((item) => item.id);
  const review: GoalReviewRecord = {
    id: `goal_review_${input.messageId}`,
    round: input.round,
    signal: input.signal ?? undefined,
    conclusion: compactConclusion(input.conclusion),
    nextStatus,
    evidenceIds: reviewEvidenceIds,
    createdAt: input.now,
  };

  return transitionGoalSession(goal, nextStatus, input.now, {
    round: Math.max(goal.round, input.round),
    statusSignal: input.signal ?? goal.statusSignal,
    planItems,
    acceptanceCriteria,
    evidence,
    reviewHistory: [...goal.reviewHistory, review].slice(-20),
    nextAction,
    blockedReason,
    noProgressRounds,
    progressFingerprint,
    lastReview: input.conclusion,
    lastMessageId: input.messageId,
  });
}

export function isGoalCompletionSupported(
  planItems: GoalPlanItem[],
  acceptanceCriteria?: GoalAcceptanceCriterion[],
): boolean {
  if (planItems.length === 0) return false;
  if (!planItems.every((item) => item.status === 'done' && Boolean(item.acceptance?.trim()))) return false;
  if (acceptanceCriteria === undefined) return true;
  const criteria = acceptanceCriteria ?? deriveAcceptanceCriteria([], planItems, [], new Date(0).toISOString());
  return criteria.length > 0 && criteria.every((criterion) => criterion.status === 'passed' && criterion.evidenceIds.length > 0);
}

export function makeGoalProgressFingerprint(
  planItems: GoalPlanItem[],
  acceptanceCriteria: GoalAcceptanceCriterion[],
): string {
  return JSON.stringify({
    plan: planItems.map((item) => [item.id, item.status, item.ownerConnectionId ?? '', item.evidenceIds?.length ?? 0]),
    acceptance: acceptanceCriteria.map((criterion) => [criterion.id, criterion.status, criterion.evidenceIds.length]),
  });
}

function deriveAcceptanceCriteria(
  current: GoalAcceptanceCriterion[],
  planItems: GoalPlanItem[],
  evidence: GoalEvidence[],
  now: string,
): GoalAcceptanceCriterion[] {
  const byId = new Map(current.map((criterion) => [criterion.id, criterion]));
  for (const item of planItems) {
    const text = item.acceptance?.trim();
    if (!text) continue;
    const id = `criterion_${item.id}`;
    const evidenceIds = evidence
      .filter((entry) => entry.planItemIds.includes(item.id))
      .map((entry) => entry.id);
    byId.set(id, {
      id,
      text,
      status: item.status === 'done' && evidenceIds.length > 0 ? 'passed' : item.status === 'blocked' ? 'failed' : 'pending',
      evidenceIds,
      updatedAt: now,
    });
  }
  return Array.from(byId.values());
}

export function collectGoalDelegationEvidence(goalId: string, tasks: DelegationTask[]): GoalEvidence[] {
  return tasks.flatMap((task) => {
    if (task.goalId !== goalId || task.status !== 'done' || !task.planItemId || !task.resultMessageId) return [];
    return [{
      id: `delegation:${task.id}`,
      kind: 'delegation' as const,
      summary: task.evidence?.filter(Boolean).join('；') || task.taskText,
      messageId: task.resultMessageId,
      taskId: task.id,
      planItemIds: [task.planItemId],
      createdAt: task.completedAt ?? task.updatedAt,
    }];
  });
}

function mergeGoalEvidence(current: GoalEvidence[], incoming: GoalEvidence[]): GoalEvidence[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) byId.set(entry.id, entry);
  return Array.from(byId.values()).slice(-50);
}

function compactConclusion(value: string): string {
  return value.replace(/```[\s\S]*?```/gu, '').replace(/\s+/gu, ' ').trim().slice(0, 600);
}
