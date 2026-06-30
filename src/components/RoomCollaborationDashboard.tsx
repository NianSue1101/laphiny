import type { ComponentType } from 'react';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import type { CollaborationEvent, DelegationTask, Room } from '../types';
import type { RoomGrowthSummary } from '../lib/room_growth';
import { formatDateTime, getCollaborationEventIcon, getDelegationTaskStatusLabel } from '../app/app_utils';
import { summarizeRoleplayConfig } from '../lib/roleplay';
import { summarizeRoomMemory } from '../lib/room_memory';
import { MarkdownText } from './MarkdownText';
import { Ionicons } from './SafeIcon';

interface RoomCollaborationDashboardProps {
  room: Room | null;
  open: boolean;
  growth: RoomGrowthSummary | null;
  delegationTasks: DelegationTask[];
  collaborationEvents: CollaborationEvent[];
  selectedFontFamily?: string;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  getDelegationTaskStatusStyle: (status: DelegationTask['status']) => any;
  onToggleOpen: () => void;
}

export function RoomCollaborationDashboard({
  room,
  open,
  growth,
  delegationTasks,
  collaborationEvents,
  selectedFontFamily,
  styles,
  TextComponent: Text,
  getDelegationTaskStatusStyle,
  onToggleOpen,
}: RoomCollaborationDashboardProps) {
  if (!room || room.kind !== 'group') return null;

  const latestSummary = room.lastSummary;

  return (
    <View style={styles.collabPanel}>
      <TouchableOpacity style={styles.collabPanelHeader} onPress={onToggleOpen}>
        <View style={styles.squareEventSource}>
          <Ionicons name="git-network-outline" size={16} color="#2563eb" />
          <Text style={styles.panelLabel}>Soul 协作时间线</Text>
        </View>
        <Text style={styles.help}>{open ? '收起' : '展开'}</Text>
      </TouchableOpacity>
      {open ? (
        <>
          {latestSummary ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>最近共识 · {latestSummary.authorName} · {formatDateTime(latestSummary.createdAt)}</Text>
              <MarkdownText content={latestSummary.content} fontFamily={selectedFontFamily} />
            </View>
          ) : <Text style={styles.help}>还没有房间共识。可在“工具 → 团队模板与总结”里生成。</Text>}
          {room.roleplay?.enabled ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>RP 房间 · {room.members.find((member) => member.connectionId === room.roleplay?.gmConnectionId)?.alias ?? 'GM'} 主持</Text>
              <Text style={styles.help}>{summarizeRoleplayConfig(room.roleplay)}</Text>
              {room.roleplay.currentScene ? <Text style={styles.help}>当前场景：{room.roleplay.currentScene}</Text> : null}
            </View>
          ) : null}
          {room.memoryCapsule ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>房间记忆胶囊 · v{room.memoryCapsule.version}</Text>
              <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
            </View>
          ) : null}
          {growth ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>房间成长层 · {growth.label}</Text>
              <Text style={styles.help}>知识 {growth.knowledgeCount} · 黑板 {growth.blackboardOpenCount} · 决策 {growth.decisionCount}{growth.pendingMemory ? ' · 待确认记忆' : ''}</Text>
            </View>
          ) : null}
          {delegationTasks.length ? (
            <View style={styles.taskList}>
              {delegationTasks.slice(0, 4).map((task) => (
                <View key={task.id} style={styles.taskCard}>
                  <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias} · {getDelegationTaskStatusLabel(task.status)}</Text>
                  <Text style={styles.help} numberOfLines={2}>{task.taskText}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {collaborationEvents.length ? (
            <View style={styles.timelineList}>
              {collaborationEvents.slice(0, 6).map((event) => (
                <View key={event.id} style={styles.timelineItem}>
                  <Ionicons name={getCollaborationEventIcon(event.kind)} size={14} color="#2563eb" />
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineTitle}>{event.title}</Text>
                    <Text style={styles.timelineMeta}>{formatDateTime(event.createdAt)}{event.source ? ` · ${event.source}` : ''}{event.target ? ` → ${event.target}` : ''}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : <Text style={styles.help}>本房间还没有协作事件。</Text>}
        </>
      ) : null}
    </View>
  );
}
