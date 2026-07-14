import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { GoalSession } from '../types';
import { formatDateTime } from '../app/app_utils';
import { getGoalPlanItemStatusLabel, getGoalStatusLabel } from '../app/app_status_labels';
import { MiniButton } from './Primitives';
import { Ionicons } from './SafeIcon';

interface ActiveGoalPanelProps {
  activeGoal?: GoalSession;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  getPlanItemStatusStyle: (status: GoalSession['planItems'][number]['status']) => any;
  onContinue: (goal: GoalSession) => void;
  onFinish: (goal: GoalSession) => void;
  onAdjust: (goal: GoalSession) => void;
}

export function ActiveGoalPanel({
  activeGoal,
  styles,
  TextComponent: Text,
  getPlanItemStatusStyle,
  onContinue,
  onFinish,
  onAdjust,
}: ActiveGoalPanelProps) {
  if (!activeGoal || activeGoal.status === 'cancelled') return null;

  const waiting = activeGoal.status === 'awaiting_user';
  const statusLabel = getGoalStatusLabel(activeGoal.status, activeGoal.statusSignal);
  const planItems = activeGoal.planItems.slice(0, 8);
  const acceptanceCriteria = (activeGoal.acceptanceCriteria ?? []).slice(0, 6);

  return (
    <View style={styles.goalPanel}>
      <View style={styles.goalPanelHeader}>
        <View style={styles.rowMain}>
          <View style={styles.squareEventSource}>
            <Ionicons name="flag-outline" size={16} color="#2563eb" />
            <Text style={styles.goalTitle} numberOfLines={1}>目标模式 · {statusLabel}</Text>
          </View>
          <Text style={styles.help} numberOfLines={2}>{activeGoal.goal}</Text>
          <Text style={styles.goalMeta}>主 AI：{activeGoal.leadAlias} · 第 {activeGoal.round} 轮 · {formatDateTime(activeGoal.updatedAt)}</Text>
        </View>
        {waiting ? (
          <View style={styles.goalActionRow}>
            <MiniButton icon="play-circle-outline" label="继续" onPress={() => onContinue(activeGoal)} />
            <MiniButton icon="checkmark-circle-outline" label="结束" onPress={() => onFinish(activeGoal)} />
            <MiniButton icon="create-outline" label="调整" onPress={() => onAdjust(activeGoal)} />
          </View>
        ) : null}
      </View>

      {planItems.length ? (
        <View style={styles.goalPlanList}>
          {planItems.map((item) => (
            <View key={item.id} style={styles.goalPlanItem}>
              <View style={styles.conflictHeader}>
                <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={[styles.badge, getPlanItemStatusStyle(item.status)]}>{getGoalPlanItemStatusLabel(item.status)}</Text>
              </View>
              <Text style={styles.help} numberOfLines={2}>
                {item.ownerAlias ? `负责人：${item.ownerAlias}` : '负责人：未指定'}
                {item.deliverable ? ` · 产物：${item.deliverable}` : ''}
              </Text>
              {item.acceptance ? <Text style={styles.goalAcceptance} numberOfLines={2}>验收：{item.acceptance}</Text> : null}
            </View>
          ))}
        </View>
      ) : <Text style={styles.help}>等待主 AI 输出结构化计划卡。</Text>}

      {acceptanceCriteria.length ? (
        <View style={styles.goalPlanList}>
          <Text style={styles.goalMeta}>验收进度</Text>
          {acceptanceCriteria.map((criterion) => (
            <Text key={criterion.id} style={styles.goalAcceptance} numberOfLines={2}>
              {criterion.status === 'passed' ? '✓' : criterion.status === 'failed' ? '!' : '○'} {criterion.text}
              {criterion.evidenceIds.length ? ` · ${criterion.evidenceIds.length} 条证据` : ''}
            </Text>
          ))}
        </View>
      ) : null}

      {activeGoal.lastReview ? <Text style={styles.goalReview} numberOfLines={4}>{activeGoal.lastReview}</Text> : null}
      {activeGoal.nextAction ? <Text style={styles.goalAcceptance} numberOfLines={3}>下一步：{activeGoal.nextAction}</Text> : null}
      {activeGoal.blockedReason ? <Text style={styles.goalReview} numberOfLines={3}>暂停原因：{activeGoal.blockedReason}</Text> : null}
    </View>
  );
}
