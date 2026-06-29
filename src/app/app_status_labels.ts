import type { DiagnosticLogEntry, DelegationTask, GoalSession, GoalStatusSignal, RoomBlackboardItemStatus, RoomDecisionRecordStatus } from '../types';

export function getGoalStatusLabel(status: GoalSession['status'], signal?: GoalStatusSignal): string {
  if (status === 'awaiting_user') return signal === 'blocked' ? '等待确认：受阻' : '等待确认：已完成';
  if (status === 'done') return '已结束';
  if (status === 'blocked') return '已受阻';
  if (status === 'reviewing') return '复盘中';
  if (status === 'running') return '推进中';
  if (status === 'planning') return '规划中';
  return '已取消';
}

export function getGoalPlanItemStatusLabel(status: GoalSession['planItems'][number]['status']): string {
  if (status === 'done') return '完成';
  if (status === 'running') return '进行中';
  if (status === 'blocked') return '受阻';
  return '待办';
}

export function getBlackboardStatusLabel(status: RoomBlackboardItemStatus): string {
  if (status === 'pinned') return '置顶';
  if (status === 'resolved') return '已完成';
  return '开放';
}

export function getDecisionStatusLabel(status: RoomDecisionRecordStatus): string {
  if (status === 'superseded') return '已过期';
  return '生效中';
}

export type StatusStyleKind = DelegationTask['status'] | GoalSession['planItems'][number]['status'] | DiagnosticLogEntry['level'];
