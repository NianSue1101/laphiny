import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import { getDelegationTaskStatusLabel } from '../../app/app_utils';
import { canRetryDelegationTask } from '../../lib/delegation_tasks';
import type { DelegationTask } from '../../types';
import { MiniButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

export function InlineDelegationTaskCard({
  task,
  styles,
  TextComponent: Text,
  onRetry,
}: {
  task: DelegationTask;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onRetry: (task: DelegationTask) => void;
}) {
  return (
    <View style={styles.inlineDelegationCard}>
      <View style={styles.inlineDelegationHeader}>
        <View style={styles.inlineDelegationTitleRow}>
          <Ionicons name="git-branch-outline" size={15} color="#c15f7c" />
          <Text style={styles.inlineDelegationEyebrow}>Agent 委托单</Text>
        </View>
        <Text style={[styles.inlineDelegationStatus, getInlineStatusStyle(task.status, styles)]}>
          {getDelegationTaskStatusLabel(task.status)}
        </Text>
      </View>
      <Text style={styles.inlineDelegationRoute}>{task.fromAlias} → {task.toAlias}</Text>
      <Text style={styles.inlineDelegationTask}>{task.taskText}</Text>
      {task.deliverable ? <Text style={styles.inlineDelegationMeta}>交付：{task.deliverable}</Text> : null}
      {task.acceptance ? <Text style={styles.inlineDelegationMeta}>验收：{task.acceptance}</Text> : null}
      {task.error ? <Text style={styles.inlineDelegationError}>{task.error}</Text> : null}
      {canRetryDelegationTask(task) ? (
        <View style={styles.messageActions}>
          <MiniButton icon="refresh-outline" label="重试委托" onPress={() => onRetry(task)} />
        </View>
      ) : null}
    </View>
  );
}

function getInlineStatusStyle(status: DelegationTask['status'], styles: Record<string, any>) {
  if (status === 'done') return styles.inlineDelegationStatusDone;
  if (status === 'error' || status === 'cancelled') return styles.inlineDelegationStatusError;
  if (status === 'running' || status === 'waiting_permission') return styles.inlineDelegationStatusRunning;
  return styles.inlineDelegationStatusPending;
}
