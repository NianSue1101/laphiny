import type { ChatMessage } from '../types';

export type InterruptedRecoveryKind = 'reattach' | 'continue' | 'manual';

const MAX_DURABLE_RECOVERY_ATTEMPTS = 20;

export function getInterruptedRecoveryKind(message: ChatMessage): InterruptedRecoveryKind {
  if (message.hermesRunId && message.hermesTransport === 'runs') return 'reattach';

  const attempts = message.recoveryAttempts ?? 0;
  const hasToolActivity = Boolean(message.activityNotices?.some((notice) => notice.kind === 'tool'));
  const hasPermissionBoundary = Boolean(message.permissionRequest);
  if (attempts === 0 && !hasToolActivity && !hasPermissionBoundary) return 'continue';
  return 'manual';
}

export function shouldRecoverInterruptedMessage(
  message: ChatMessage,
  activeStreamIds: Record<string, true>,
): boolean {
  if (message.status !== 'interrupted') return false;
  if (message.authorId === 'user' || message.authorId === 'system') return false;
  if (activeStreamIds[message.id]) return false;
  const kind = getInterruptedRecoveryKind(message);
  if (kind === 'manual') return false;
  return kind !== 'reattach' || (message.recoveryAttempts ?? 0) < MAX_DURABLE_RECOVERY_ATTEMPTS;
}

