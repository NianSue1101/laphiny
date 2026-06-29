import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextProps } from 'react-native';

import type { CollaborationEvent, DelegationTask, Room } from '../types';
import type { RoomGrowthSummary } from '../lib/room_growth';
import type { TaskBoardColumn } from '../lib/stage4_plus';
import { formatDateTime, getCollaborationEventIcon, getDelegationTaskStatusLabel } from '../app/app_utils';
import { summarizeRoleplayArchive } from '../lib/stage4_plus';
import { summarizeRoomMemory } from '../lib/room_memory';
import { MarkdownText } from './MarkdownText';
import { RoomStatusBar } from './RoomStatusBar';
import { RoleplaySceneCard } from './RoleplaySceneCard';
import { Ionicons } from './SafeIcon';

interface CollaborationDrawerProps {
  room: Room | null;
  taskBoard: TaskBoardColumn[];
  delegationTasks: DelegationTask[];
  collaborationEvents: CollaborationEvent[];
  growth: RoomGrowthSummary | null;
  selectedFontFamily?: string;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  getDelegationTaskStatusStyle: (status: DelegationTask['status']) => any;
  onClose: () => void;
}

export function CollaborationDrawer({
  room,
  taskBoard,
  delegationTasks,
  collaborationEvents,
  growth,
  selectedFontFamily,
  styles,
  TextComponent: Text,
  getDelegationTaskStatusStyle,
  onClose,
}: CollaborationDrawerProps) {
  if (!room || room.kind !== 'group') return null;

  return (
    <View style={styles.collabDrawer}>
      <ScrollView style={styles.collabDrawerScroll} contentContainerStyle={styles.collabDrawerContent}>
        <View style={styles.drawerHeader}>
          <View>
            <Text style={styles.drawerTitle}>Soul 房间侧栏</Text>
            <Text style={styles.help}>协作、委托、记忆和 RP 场景集中在这里。</Text>
          </View>
          <TouchableOpacity style={styles.sidebarIconButton} onPress={onClose}>
            <Ionicons name="close" size={18} color="#4b5563" />
          </TouchableOpacity>
        </View>
        <RoomStatusBar room={room} delegationTasks={delegationTasks} styles={styles} />
        <RoleplaySceneCard room={room} styles={styles} TextComponent={Text} />
        {room.lastSummary ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>最近共识 · {room.lastSummary.authorName}</Text>
            <MarkdownText content={room.lastSummary.content} fontFamily={selectedFontFamily} />
          </View>
        ) : <Text style={styles.help}>还没有最近共识。可在工具里生成总结。</Text>}
        {room.memoryCapsule ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>房间记忆胶囊 · v{room.memoryCapsule.version}</Text>
            <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
          </View>
        ) : null}
        {growth ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>房间成长层 · {growth.label}</Text>
            <Text style={styles.help}>知识 {growth.knowledgeCount} · 开放黑板 {growth.blackboardOpenCount} · 决策 {growth.decisionCount}{growth.pendingMemory ? ' · 有待确认记忆草案' : ''}</Text>
          </View>
        ) : null}
        {room.roleplay?.archive ? (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryTitle}>RP 剧本档案 · v{room.roleplay.archive.version}</Text>
            <Text style={styles.help}>{summarizeRoleplayArchive(room.roleplay.archive)}</Text>
            <Text style={styles.help}>主线：{room.roleplay.archive.currentQuest}</Text>
          </View>
        ) : null}
        <Text style={styles.panelLabel}>任务看板</Text>
        {taskBoard.map((column) => (
          <View key={column.id} style={styles.drawerTaskColumn}>
            <Text style={styles.taskBoardTitle}>{column.label} · {column.tasks.length}</Text>
            {column.tasks.slice(0, 3).map((task) => (
              <Text key={task.id} style={styles.help} numberOfLines={2}>• {task.toAlias}：{task.taskText}</Text>
            ))}
          </View>
        ))}
        <Text style={styles.panelLabel}>委托任务</Text>
        {delegationTasks.length ? delegationTasks.slice(0, 8).map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.conflictHeader}>
              <Text style={styles.taskTitle}>{task.fromAlias} → {task.toAlias}</Text>
              <Text style={[styles.badge, getDelegationTaskStatusStyle(task.status)]}>{getDelegationTaskStatusLabel(task.status)}</Text>
            </View>
            <Text style={styles.help} numberOfLines={3}>{task.taskText}</Text>
          </View>
        )) : <Text style={styles.help}>暂无委托任务。</Text>}
        <Text style={styles.panelLabel}>最近协作</Text>
        {collaborationEvents.length ? collaborationEvents.slice(0, 10).map((event) => (
          <View key={event.id} style={styles.timelineItem}>
            <Ionicons name={getCollaborationEventIcon(event.kind)} size={14} color="#2563eb" />
            <View style={styles.timelineBody}>
              <Text style={styles.timelineTitle}>{event.title}</Text>
              <Text style={styles.timelineMeta}>{formatDateTime(event.createdAt)}{event.source ? ` · ${event.source}` : ''}{event.target ? ` → ${event.target}` : ''}</Text>
            </View>
          </View>
        )) : <Text style={styles.help}>暂无协作时间线。</Text>}
      </ScrollView>
    </View>
  );
}
