import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import {
  formatDateTime,
  getCollaborationEventIcon,
  getDelegationTaskStatusLabel,
  getTeamTemplateModeLabel,
} from '../../app/app_utils';
import { summarizeAgentProfile } from '../../lib/agent_profile';
import type {
  AgentProfileVersion,
  CollaborationEvent,
  DelegationTask,
  TeamTemplate,
} from '../../types';
import { SecondaryButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

type Styles = Record<string, any>;

interface CollaborationArchivePanelProps {
  collaborationEvents: CollaborationEvent[];
  delegationTasks: DelegationTask[];
  teamTemplates: TeamTemplate[];
  latestProfileVersions: AgentProfileVersion[];
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  getDelegationTaskStatusStyle: (status: DelegationTask['status']) => any;
  onDeleteTeamTemplate: (template: TeamTemplate) => void;
  onRestoreProfileVersion: (version: AgentProfileVersion) => void;
}

export function CollaborationArchivePanel({
  collaborationEvents,
  delegationTasks,
  teamTemplates,
  latestProfileVersions,
  styles,
  TextComponent: Text,
  getDelegationTaskStatusStyle,
  onDeleteTeamTemplate,
  onRestoreProfileVersion,
}: CollaborationArchivePanelProps) {
  const recentEvents = [...collaborationEvents]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  const recentTasks = [...delegationTasks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return (
    <View style={styles.diagnosticPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.cardTitle}>Soul 协作工作台</Text>
          <Text style={styles.help}>
            阶段四差异点：协作时间线、委托任务卡、团队模板和协作卡片版本都集中在这里。
          </Text>
        </View>
        <Text style={styles.squareCount}>{recentEvents.length} 条协作</Text>
      </View>

      <Text style={styles.panelLabel}>委托任务卡</Text>
      {recentTasks.length ? (
        recentTasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.conflictHeader}>
              <Text style={styles.taskTitle}>
                {task.fromAlias} → {task.toAlias}
              </Text>
              <Text style={[styles.badge, getDelegationTaskStatusStyle(task.status)]}>
                {getDelegationTaskStatusLabel(task.status)}
              </Text>
            </View>
            <Text style={styles.help}>
              {task.roomName} · 深度 {task.depth} · {formatDateTime(task.updatedAt)}
            </Text>
            <Text style={styles.diagnosticMessage}>{task.taskText}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.help}>还没有 Agent-to-Agent 委托任务。</Text>
      )}

      <Text style={styles.panelLabel}>团队模板</Text>
      {teamTemplates.length ? (
        teamTemplates.map((template) => (
          <View key={template.id} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <View>
                <Text style={styles.conflictItemTitle}>{template.name}</Text>
                <Text style={styles.help}>
                  {getTeamTemplateModeLabel(template.defaultMode)} · 委托深度{' '}
                  {template.maxDelegationDepth} ·{' '}
                  {template.autoDelegationEnabled ? '自动委托' : '不自动委托'}
                </Text>
              </View>
              <SecondaryButton
                icon="trash-outline"
                label="删除"
                onPress={() => onDeleteTeamTemplate(template)}
              />
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.help}>还没有保存团队模板。可在房间工具里保存当前小队配置。</Text>
      )}

      <Text style={styles.panelLabel}>协作卡片版本</Text>
      {latestProfileVersions.length ? (
        latestProfileVersions.map((version) => (
          <View key={version.id} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <View style={styles.rowMain}>
                <Text style={styles.conflictItemTitle}>{version.connectionName}</Text>
                <Text style={styles.help}>
                  {formatDateTime(version.createdAt)} · {version.note ?? '协作卡片版本'}
                </Text>
                <Text style={styles.diagnosticMessage} numberOfLines={2}>
                  {summarizeAgentProfile(version.profile)}
                </Text>
              </View>
              <SecondaryButton
                icon="reload-outline"
                label="回滚"
                onPress={() => onRestoreProfileVersion(version)}
              />
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.help}>生成或更新协作卡片后，这里会保留版本历史。</Text>
      )}

      <Text style={styles.panelLabel}>最近协作时间线</Text>
      {recentEvents.length ? (
        recentEvents.map((event) => (
          <View key={event.id} style={styles.timelineItemLarge}>
            <Ionicons name={getCollaborationEventIcon(event.kind)} size={16} color="#2563eb" />
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{event.title}</Text>
              <Text style={styles.timelineMeta}>
                {event.roomName} · {formatDateTime(event.createdAt)}
                {event.source ? ` · ${event.source}` : ''}
                {event.target ? ` → ${event.target}` : ''}
              </Text>
              {event.body ? (
                <Text style={styles.help} numberOfLines={2}>
                  {event.body}
                </Text>
              ) : null}
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.help}>还没有协作事件。</Text>
      )}
    </View>
  );
}
