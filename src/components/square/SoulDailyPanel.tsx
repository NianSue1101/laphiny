import type { ComponentType } from 'react';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import {
  formatDateTime,
  getDelegationTaskStatusLabel,
} from '../../app/app_utils';
import type { SoulDailyDigest } from '../../lib/square_insights';
import { summarizeRoomMemory } from '../../lib/room_memory';
import type { DelegationTask, Room } from '../../types';
import { HealthMetric } from '../Primitives';

type Styles = Record<string, any>;

interface SoulDailyPanelProps {
  dailyDigest: SoulDailyDigest;
  delegationTasks: DelegationTask[];
  rooms: Room[];
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  getDelegationTaskStatusStyle: (status: DelegationTask['status']) => any;
  onOpenRoom: (roomId: string) => void;
  onOpenRoomManagement: (roomId: string) => void;
}

export function SoulDailyPanel({
  dailyDigest,
  delegationTasks,
  rooms,
  styles,
  TextComponent: Text,
  getDelegationTaskStatusStyle,
  onOpenRoom,
  onOpenRoomManagement,
}: SoulDailyPanelProps) {
  const openTasks = delegationTasks
    .filter((task) => task.status === 'pending' || task.status === 'running')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 6);
  const memoryRooms = rooms.filter((room) => room.memoryCapsule).slice(0, 6);

  return (
    <View style={styles.diagnosticPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.cardTitle}>今日小队动态</Text>
          <Text style={styles.help}>
            从今天 0 点起统计 Soul 小队活动：发言、委托、总结、房间记忆和活跃房间。
          </Text>
        </View>
        <Text style={styles.squareCount}>{dailyDigest.agentReplies} 次回复</Text>
      </View>
      <View style={styles.healthMetricRow}>
        <HealthMetric label="用户消息" value={dailyDigest.userMessages} tone="unknown" />
        <HealthMetric
          label="协作事件"
          value={dailyDigest.collaborationEvents}
          tone="checking"
        />
        <HealthMetric
          label="委托完成"
          value={dailyDigest.completedDelegations}
          tone={dailyDigest.completedDelegations > 0 ? 'ok' : 'unknown'}
        />
        <HealthMetric
          label="待处理"
          value={dailyDigest.pendingDelegations}
          tone={dailyDigest.pendingDelegations > 0 ? 'checking' : 'ok'}
        />
      </View>

      <Text style={styles.panelLabel}>Agent 今日表现</Text>
      {dailyDigest.agentStats.length ? (
        dailyDigest.agentStats.slice(0, 8).map((stat) => (
          <View key={stat.connectionId} style={styles.conflictItem}>
            <View style={styles.conflictHeader}>
              <Text style={styles.conflictItemTitle}>{stat.name}</Text>
              <Text style={styles.help}>
                {stat.replies} 回复 · 接收 {stat.delegatedIn} 委托 · 完成{' '}
                {stat.completedTasks} 个{stat.profileUpdated ? ' · 卡片已更新' : ''}
              </Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.help}>今天还没有 Agent 活动。</Text>
      )}

      <Text style={styles.panelLabel}>活跃房间</Text>
      {dailyDigest.activeRooms.length ? (
        dailyDigest.activeRooms.map((room) => (
          <TouchableOpacity
            key={room.roomId}
            style={styles.conflictItem}
            onPress={() => onOpenRoom(room.roomId)}
          >
            <Text style={styles.conflictItemTitle}>{room.roomName}</Text>
            <Text style={styles.help}>
              {room.messages} 条消息 · {room.collaborations} 个协作事件
            </Text>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.help}>今天还没有活跃房间。</Text>
      )}

      <Text style={styles.panelLabel}>未完成委托任务</Text>
      {openTasks.length ? (
        openTasks.map((task) => (
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
              {task.roomName} · {formatDateTime(task.updatedAt)}
            </Text>
            <Text style={styles.diagnosticMessage}>{task.taskText}</Text>
          </View>
        ))
      ) : (
        <Text style={styles.help}>没有未完成的委托任务。</Text>
      )}

      <Text style={styles.panelLabel}>房间记忆胶囊</Text>
      {memoryRooms.length ? (
        memoryRooms.map((room) => (
          <TouchableOpacity
            key={room.id}
            style={styles.conflictItem}
            onPress={() => onOpenRoomManagement(room.id)}
          >
            <Text style={styles.conflictItemTitle}>{room.name}</Text>
            <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.help}>
          还没有房间记忆胶囊。可在群聊工具里生成。
        </Text>
      )}
    </View>
  );
}
