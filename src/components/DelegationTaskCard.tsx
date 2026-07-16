import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import { formatDateTime, getDelegationTaskStatusLabel } from '../app/app_utils';
import { canReassignDelegationTask, canRetryDelegationTask } from '../lib/delegation_tasks';
import type { DelegationTask, Room } from '../types';
import { SecondaryButton } from './Primitives';

export function DelegationTaskCard({
  task,
  room,
  styles,
  TextComponent: Text,
  getStatusStyle,
  onRetry,
  onReassign,
}: {
  task: DelegationTask;
  room: Room;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  getStatusStyle: (status: DelegationTask['status']) => any;
  onRetry?: (task: DelegationTask) => void;
  onReassign?: (task: DelegationTask, targetConnectionId: string) => void;
}) {
  const reassignTarget = room.members.find((member) => member.enabled && member.connectionId !== task.toConnectionId);
  const recentAttempts = [...(task.attemptHistory ?? [])].reverse().slice(0, 3);
  return (
    <View style={styles.taskCard}>
      <View style={styles.conflictHeader}>
        <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
        <Text style={[styles.badge, getStatusStyle(task.status)]}>{getDelegationTaskStatusLabel(task.status)}</Text>
      </View>
      <Text style={styles.help} numberOfLines={3}>{task.taskText}</Text>
      <Text style={styles.timelineMeta}>共 {task.attemptHistory?.length ?? task.attempts ?? 0} 次尝试 · revision {task.revision ?? 0}</Text>
      {task.error ? <Text style={styles.diagnosticErrorText}>{task.error}</Text> : null}
      {recentAttempts.map((attempt) => (
        <Text key={attempt.id} style={styles.timelineMeta} numberOfLines={2}>
          #{attempt.number} {attempt.kind === 'reassign' ? '改派' : attempt.kind === 'retry' ? '重试' : '首次'} · {attempt.toAlias} · {attempt.status} · {formatDateTime(attempt.completedAt ?? attempt.startedAt ?? attempt.createdAt)}
        </Text>
      ))}
      {canRetryDelegationTask(task) ? (
        <View style={styles.buttonRowCompact}>
          <SecondaryButton icon="refresh-outline" label="重试" onPress={() => onRetry?.(task)} disabled={!onRetry} />
          <SecondaryButton
            icon="swap-horizontal-outline"
            label={reassignTarget ? `改派 ${reassignTarget.alias}` : '无可改派成员'}
            onPress={() => reassignTarget && onReassign?.(task, reassignTarget.connectionId)}
            disabled={!reassignTarget || !onReassign || !canReassignDelegationTask(task)}
          />
        </View>
      ) : null}
    </View>
  );
}
