import type { CollaborationEvent, DelegationTask, Room } from '../types';

const FORBIDDEN_KEY = /api.?key|base.?url|session.?key|connection.?id|reasoning|messages?|attachments?|content/iu;
const SECRET_TEXT = /(?:https?:\/\/|Bearer\s+|api[_-]?key\s*[:=]|token\s*[:=]|secret\s*[:=]|password\s*[:=]|[A-Fa-f0-9]{32,}|[A-Za-z]:\\|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b(?:\d{1,3}\.){3}\d{1,3}\b)/iu;

export function buildCollaborationRunReport({
  room,
  tasks,
  events,
  appVersion,
  generatedAt = new Date().toISOString(),
}: {
  room: Room;
  tasks: DelegationTask[];
  events: CollaborationEvent[];
  appVersion: string;
  generatedAt?: string;
}): Record<string, unknown> {
  const aliases = new Map<string, string>();
  const pseudonym = (value: string) => {
    const current = aliases.get(value);
    if (current) return current;
    const next = `Agent ${aliases.size + 1}`;
    aliases.set(value, next);
    return next;
  };
  const scopedTasks = tasks.filter((task) => task.roomId === room.id);
  const scopedEvents = events.filter((event) => event.roomId === room.id);
  const goal = room.activeGoal;
  const report = {
    schema: 'laphiny.collaboration-report.v1',
    appVersion,
    generatedAt,
    scope: {
      roomKind: room.kind,
      startedAt: goal?.createdAt ?? scopedTasks[0]?.createdAt ?? scopedEvents[0]?.createdAt,
      endedAt: goal?.completedAt ?? latestTimestamp(scopedTasks.map((task) => task.completedAt).filter(Boolean) as string[]),
      terminalState: goal?.status ?? deriveTerminalState(scopedTasks),
    },
    goal: goal ? {
      status: goal.status,
      round: goal.round,
      criteria: goal.acceptanceCriteria.map((item, index) => ({
        id: `criterion_${index + 1}`,
        status: item.status,
        evidenceRefs: item.evidenceIds.map((evidenceId) => `evidence_${Math.max(1, goal.evidence.findIndex((evidence) => evidence.id === evidenceId) + 1)}`),
      })),
      evidence: goal.evidence.map((item, index) => ({
        id: `evidence_${index + 1}`,
        kind: item.kind,
        summary: redactEvidence(item.summary),
        at: item.createdAt,
      })),
    } : undefined,
    tasks: scopedTasks.map((task, index) => ({
      id: `task_${index + 1}`,
      from: pseudonym(task.fromAlias),
      to: pseudonym(task.toAlias),
      status: task.status,
      attempts: (task.attemptHistory ?? []).map((attempt) => ({
        number: attempt.number,
        kind: attempt.kind,
        agent: pseudonym(attempt.toAlias),
        status: attempt.status,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        error: redactEvidence(attempt.error),
      })),
      evidence: (task.evidence ?? []).map(redactEvidence).filter(Boolean),
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    })),
    events: scopedEvents.map((event) => ({ kind: event.kind, at: event.createdAt })),
    omitted: ['chat text', 'attachments', 'private connection metadata', 'API keys', 'service reasoning'],
  };
  assertCollaborationReportSafe(report);
  return report;
}

export function assertCollaborationReportSafe(value: unknown): void {
  visit(value);
  const serialized = JSON.stringify(value);
  if (SECRET_TEXT.test(serialized)) throw new Error('协作报告仍包含疑似私密文本，已拒绝导出');
}

function visit(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEY.test(key)) throw new Error(`协作报告包含禁止字段：${key}`);
    visit(child);
  }
}

function redactEvidence(value?: string): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/https?:\/\/\S+/giu, '[redacted-url]')
    .replace(/Bearer\s+\S+/giu, 'Bearer [redacted]')
    .replace(/(api[_-]?key|token|secret|password)(\s*[:=]\s*)\S+/giu, '[redacted-secret]')
    .replace(/[A-Fa-f0-9]{32,}/gu, '[redacted-token]')
    .replace(/[A-Za-z]:\\\S+/gu, '[redacted-path]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, '[redacted-email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, '[redacted-ip]')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 300);
}

function deriveTerminalState(tasks: DelegationTask[]): string {
  if (tasks.some((task) => task.status === 'running' || task.status === 'pending' || task.status === 'waiting_permission')) return 'running';
  if (tasks.some((task) => task.status === 'error')) return 'failed';
  if (tasks.length && tasks.every((task) => task.status === 'done')) return 'done';
  return 'idle';
}

function latestTimestamp(values: string[]): string | undefined {
  return [...values].sort().at(-1);
}
