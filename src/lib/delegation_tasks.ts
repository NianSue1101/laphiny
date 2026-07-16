import type {
  DelegationAttempt,
  DelegationAttemptKind,
  DelegationAttemptStatus,
  DelegationTask,
  DelegationTaskStatus,
} from '../types';

const RETRYABLE_ATTEMPT_STATUSES = new Set<DelegationAttemptStatus>([
  'error', 'cancelled', 'interrupted', 'outcome_unknown',
]);
const TERMINAL_ATTEMPT_STATUSES = new Set<DelegationAttemptStatus>([
  'done', 'error', 'cancelled', 'interrupted', 'outcome_unknown',
]);

export type BeginDelegationAttemptInput = {
  operationId: string;
  kind: DelegationAttemptKind;
  toConnectionId: string;
  toAlias: string;
  now: string;
  attemptId: string;
};

export type DelegationAttemptTransition = {
  status: DelegationAttemptStatus;
  now: string;
  resultMessageId?: string;
  error?: string;
  evidence?: string[];
};

export function beginDelegationAttempt(
  task: DelegationTask,
  input: BeginDelegationAttemptInput,
): { task: DelegationTask; attempt: DelegationAttempt; created: boolean } {
  const normalized = normalizeDelegationTask(task);
  const duplicate = normalized.attemptHistory!.find((attempt) => attempt.operationId === input.operationId);
  if (duplicate) return { task: normalized, attempt: duplicate, created: false };

  const current = getCurrentDelegationAttempt(normalized);
  if (current && !TERMINAL_ATTEMPT_STATUSES.has(current.status)) {
    throw new Error('当前委托尝试仍在运行，不能重复开始');
  }
  if (input.kind === 'retry' && !canRetryDelegationTask(normalized)) {
    throw new Error('当前委托状态不可重试');
  }
  if (input.kind === 'reassign' && !canReassignDelegationTask(normalized)) {
    throw new Error('当前委托状态不可改派');
  }
  if (input.kind === 'reassign' && input.toConnectionId === normalized.toConnectionId) {
    throw new Error('改派目标必须不同于当前 Agent');
  }

  const attempt: DelegationAttempt = {
    id: input.attemptId,
    operationId: input.operationId,
    number: normalized.attemptHistory!.length + 1,
    kind: input.kind,
    toConnectionId: input.toConnectionId,
    toAlias: input.toAlias,
    status: 'pending',
    createdAt: input.now,
  };
  const assignmentHistory = input.kind === 'reassign' || normalized.assignmentHistory!.length === 0
    ? [...normalized.assignmentHistory!, {
        id: `assignment_${attempt.id}`,
        attemptId: attempt.id,
        fromConnectionId: input.kind === 'reassign' ? normalized.toConnectionId : undefined,
        fromAlias: input.kind === 'reassign' ? normalized.toAlias : undefined,
        toConnectionId: input.toConnectionId,
        toAlias: input.toAlias,
        reason: input.kind === 'reassign' ? 'reassign' as const : 'initial' as const,
        createdAt: input.now,
      }]
    : normalized.assignmentHistory!;
  const next: DelegationTask = {
    ...normalized,
    toConnectionId: input.toConnectionId,
    toAlias: input.toAlias,
    status: 'pending',
    attempts: attempt.number,
    revision: normalized.revision! + 1,
    currentAttemptId: attempt.id,
    attemptHistory: [...normalized.attemptHistory!, attempt],
    assignmentHistory,
    error: undefined,
    resultMessageId: undefined,
    completedAt: undefined,
    updatedAt: input.now,
  };
  return { task: next, attempt, created: true };
}

export function transitionDelegationAttempt(
  task: DelegationTask,
  attemptId: string,
  transition: DelegationAttemptTransition,
): DelegationTask {
  const normalized = normalizeDelegationTask(task);
  const attempt = normalized.attemptHistory!.find((item) => item.id === attemptId);
  if (!attempt) throw new Error('委托尝试不存在');
  if (!isAllowedAttemptTransition(attempt.status, transition.status)) {
    throw new Error(`非法委托状态转换：${attempt.status} → ${transition.status}`);
  }
  const nextAttempt: DelegationAttempt = {
    ...attempt,
    status: transition.status,
    resultMessageId: transition.resultMessageId ?? attempt.resultMessageId,
    error: transition.error,
    evidence: transition.evidence ?? attempt.evidence,
    startedAt: transition.status === 'running' ? attempt.startedAt ?? transition.now : attempt.startedAt,
    completedAt: TERMINAL_ATTEMPT_STATUSES.has(transition.status) ? transition.now : undefined,
  };
  const attemptHistory = normalized.attemptHistory!.map((item) => item.id === attemptId ? nextAttempt : item);

  // Late events remain in history but can never overwrite a newer attempt's task-level state.
  if (normalized.currentAttemptId !== attemptId) {
    return { ...normalized, revision: normalized.revision! + 1, attemptHistory, updatedAt: transition.now };
  }
  const taskStatus = toTaskStatus(transition.status);
  return {
    ...normalized,
    status: taskStatus,
    revision: normalized.revision! + 1,
    attemptHistory,
    attempts: attemptHistory.length,
    resultMessageId: transition.resultMessageId ?? normalized.resultMessageId,
    error: transition.error,
    evidence: transition.evidence ?? normalized.evidence,
    completedAt: TERMINAL_ATTEMPT_STATUSES.has(transition.status) ? transition.now : undefined,
    updatedAt: transition.now,
  };
}

export function normalizeDelegationTask(task: DelegationTask): DelegationTask {
  return {
    ...task,
    revision: Number.isFinite(task.revision) ? task.revision : 0,
    attempts: task.attemptHistory?.length ?? task.attempts ?? 0,
    attemptHistory: Array.isArray(task.attemptHistory) ? task.attemptHistory : [],
    assignmentHistory: Array.isArray(task.assignmentHistory) ? task.assignmentHistory : [],
  };
}

export function normalizeDelegationTasksAfterHydration(tasks: DelegationTask[], now: string): DelegationTask[] {
  return tasks.map((raw) => {
    const task = normalizeDelegationTask(raw);
    const current = getCurrentDelegationAttempt(task);
    if (!current || !['pending', 'running', 'waiting_permission'].includes(current.status)) return task;
    return transitionDelegationAttempt(task, current.id, {
      status: 'interrupted',
      error: '应用退出时委托仍在运行，可安全重试。',
      now,
    });
  });
}

export function mergeDelegationTaskRecords(tasks: DelegationTask[]): DelegationTask[] {
  const byId = new Map<string, DelegationTask>();
  for (const raw of tasks) {
    const incoming = normalizeDelegationTask(raw);
    const current = byId.get(incoming.id);
    if (!current) {
      byId.set(incoming.id, incoming);
      continue;
    }
    const incomingWins = (incoming.revision ?? 0) > (current.revision ?? 0)
      || ((incoming.revision ?? 0) === (current.revision ?? 0) && incoming.updatedAt >= current.updatedAt);
    const winner = incomingWins ? incoming : current;
    const attemptById = new Map([...(current.attemptHistory ?? []), ...(incoming.attemptHistory ?? [])].map((item) => [item.id, item]));
    const assignmentById = new Map([...(current.assignmentHistory ?? []), ...(incoming.assignmentHistory ?? [])].map((item) => [item.id, item]));
    byId.set(incoming.id, {
      ...winner,
      attemptHistory: [...attemptById.values()].sort((a, b) => a.number - b.number),
      assignmentHistory: [...assignmentById.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    });
  }
  return [...byId.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

export function getCurrentDelegationAttempt(task: DelegationTask): DelegationAttempt | undefined {
  return task.attemptHistory?.find((attempt) => attempt.id === task.currentAttemptId);
}

export function canRetryDelegationTask(task: DelegationTask): boolean {
  const current = getCurrentDelegationAttempt(task);
  if (current) return RETRYABLE_ATTEMPT_STATUSES.has(current.status);
  return task.status === 'error' || task.status === 'cancelled';
}

export function canReassignDelegationTask(task: DelegationTask): boolean {
  return canRetryDelegationTask(task);
}

function isAllowedAttemptTransition(from: DelegationAttemptStatus, to: DelegationAttemptStatus): boolean {
  if (from === to) return true;
  if (from === 'pending') return ['running', 'error', 'cancelled', 'interrupted'].includes(to);
  if (from === 'running') return ['waiting_permission', 'done', 'error', 'cancelled', 'interrupted', 'outcome_unknown'].includes(to);
  if (from === 'waiting_permission') return ['running', 'done', 'error', 'cancelled', 'interrupted'].includes(to);
  return false;
}

function toTaskStatus(status: DelegationAttemptStatus): DelegationTaskStatus {
  if (status === 'interrupted' || status === 'outcome_unknown') return 'error';
  return status;
}
