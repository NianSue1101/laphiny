import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextInputProps, type TextProps } from 'react-native';

import { DEFAULT_CONTEXT_LIMIT, MAX_DELEGATION_DEPTH } from '../config/app_config';
import type { HermesConnection, Room, RoomMember, RoomModeId } from '../types';
import { ROOM_MODES } from '../lib/stage4_plus';
import { summarizeRoomGrowth } from '../lib/room_growth';
import { AgentBadge, MiniButton, StatusToken } from './Primitives';

interface RoomManagementPanelProps {
  room: Room;
  messageCount: number;
  enabledConnections: HermesConnection[];
  connectionById: Map<string, HermesConnection>;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  updateRoomInline: (roomId: string, patch: Partial<Room>) => void;
  adjustRoomContextLimit: (room: Room, delta: number) => void;
  applyRoomModeInline: (room: Room, mode: RoomModeId) => void;
  toggleRoomMemberEnabledInline: (room: Room, member: RoomMember) => void;
  chooseConnectionAvatar: (connection: HermesConnection) => void;
  openFocusedChatRoom: (roomId: string) => void;
  deleteRoom: (roomId: string) => void;
  closeManagement: () => void;
}

export function RoomManagementPanel({
  room,
  messageCount,
  enabledConnections,
  connectionById,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  updateRoomInline,
  adjustRoomContextLimit,
  applyRoomModeInline,
  toggleRoomMemberEnabledInline,
  chooseConnectionAvatar,
  openFocusedChatRoom,
  deleteRoom,
  closeManagement,
}: RoomManagementPanelProps) {
  const enabledCount = room.members.filter((member) => member.enabled).length;
  const roomGrowth = summarizeRoomGrowth(room);
  const availableConnections = enabledConnections.filter((connection) => !room.members.some((member) => member.connectionId === connection.id));

  return (
    <View style={styles.roomManagementPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.panelLabel}>房间管理中心</Text>
          <Text style={styles.help}>当前正在管理「{room.name}」，所有修改直接写入这个房间，不会跳转到聊天旧面板。</Text>
        </View>
        <StatusToken icon="settings-outline" label={roomGrowth.label} tone="memory" />
      </View>

      <View style={styles.toolMetricRow}>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{messageCount}</Text>
          <Text style={styles.toolMetricLabel}>消息</Text>
        </View>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{enabledCount}/{room.members.length}</Text>
          <Text style={styles.toolMetricLabel}>成员</Text>
        </View>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{room.contextLimit ?? DEFAULT_CONTEXT_LIMIT}</Text>
          <Text style={styles.toolMetricLabel}>上下文</Text>
        </View>
      </View>

      <Text style={styles.panelLabel}>基础信息</Text>
      <TextInput
        style={styles.input}
        value={room.name}
        onChangeText={(name) => updateRoomInline(room.id, { name })}
        placeholder="房间名称"
      />
      <View style={styles.inlineFormRow}>
        <Text style={styles.help}>上下文 {room.contextLimit ?? DEFAULT_CONTEXT_LIMIT} 条</Text>
        <View style={styles.stepper}>
          <MiniButton icon="remove-outline" label="-4" onPress={() => adjustRoomContextLimit(room, -4)} />
          <MiniButton icon="add-outline" label="+4" onPress={() => adjustRoomContextLimit(room, 4)} />
        </View>
      </View>

      {room.kind === 'group' ? (
        <>
          <Text style={styles.panelLabel}>房间模式</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modePillRow}>
            {ROOM_MODES.map((mode) => (
              <TouchableOpacity
                key={mode.id}
                style={[styles.modePill, room.mode === mode.id && styles.modePillActive]}
                onPress={() => applyRoomModeInline(room, mode.id)}
              >
                <Text style={[styles.modePillText, room.mode === mode.id && styles.modePillTextActive]}>{mode.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.panelLabel}>默认协作策略</Text>
          <View style={styles.toolActions}>
            <MiniButton icon="hand-left-outline" label={room.defaultCollaborationMode === 'manual' || !room.defaultCollaborationMode ? '默认：手动' : '切手动'} onPress={() => updateRoomInline(room.id, { defaultCollaborationMode: 'manual' })} />
            <MiniButton icon="git-network-outline" label={room.defaultCollaborationMode === 'parallel' ? '默认：并行' : '切并行'} onPress={() => updateRoomInline(room.id, { defaultCollaborationMode: 'parallel' })} />
            <MiniButton icon="git-branch-outline" label={room.defaultCollaborationMode === 'sequential' ? '默认：接力' : '切接力'} onPress={() => updateRoomInline(room.id, { defaultCollaborationMode: 'sequential' })} />
            <MiniButton icon={room.autoDelegationEnabled === false ? 'flash-off-outline' : 'flash-outline'} label={room.autoDelegationEnabled === false ? '自动委托关' : '自动委托开'} onPress={() => updateRoomInline(room.id, { autoDelegationEnabled: room.autoDelegationEnabled === false })} />
            <MiniButton icon={room.agentToolDelegationEnabled === false ? 'construct-outline' : 'construct'} label={room.agentToolDelegationEnabled === false ? '工具委托关' : '工具委托开'} onPress={() => updateRoomInline(room.id, { agentToolDelegationEnabled: room.agentToolDelegationEnabled === false })} />
          </View>
          <View style={styles.stepper}>
            <MiniButton icon="remove-outline" label="深度 -1" onPress={() => updateRoomInline(room.id, { maxDelegationDepth: Math.max(0, Math.min(6, (room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH) - 1)) })} />
            <Text style={styles.help}>最大委托深度：{room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH}</Text>
            <MiniButton icon="add-outline" label="深度 +1" onPress={() => updateRoomInline(room.id, { maxDelegationDepth: Math.max(0, Math.min(6, (room.maxDelegationDepth ?? MAX_DELEGATION_DEPTH) + 1)) })} />
          </View>
          <Text style={styles.help}>工具委托默认开启。连接测试确认已安装 laphiny-hermes-delegation 后，Agent 会通过 Hermes 工具调用创建可验证的委托；不支持的连接会保留兼容委托解析。</Text>
        </>
      ) : null}

      <Text style={styles.panelLabel}>成员</Text>
      <View style={styles.roomMemberManageList}>
        {room.members.map((member) => {
          const connection = connectionById.get(member.connectionId);
          return (
            <View key={member.connectionId} style={styles.roomMemberManageRow}>
              <TouchableOpacity onPress={() => toggleRoomMemberEnabledInline(room, member)} disabled={room.kind !== 'group'}>
                <AgentBadge alias={member.alias} active={member.enabled} imageUri={connection?.avatarUri} />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, styles.memberAliasInput]}
                value={member.alias}
                onChangeText={(alias) => updateRoomInline(room.id, { members: room.members.map((item) => item.connectionId === member.connectionId ? { ...item, alias } : item) })}
                placeholder="成员别名"
              />
              {connection ? <MiniButton icon="image-outline" label="头像" onPress={() => chooseConnectionAvatar(connection)} /> : null}
              {room.kind === 'group' && room.members.length > 1 ? (
                <MiniButton
                  icon="remove-circle-outline"
                  label="移除"
                  onPress={() => updateRoomInline(room.id, { members: room.members.filter((item) => item.connectionId !== member.connectionId) })}
                />
              ) : null}
            </View>
          );
        })}
      </View>

      {room.kind === 'group' ? (
        <View style={styles.toolActions}>
          {availableConnections.map((connection) => (
            <MiniButton
              key={connection.id}
              icon="add-circle-outline"
              label={`加入 ${connection.name}`}
              onPress={() => updateRoomInline(room.id, {
                members: [...room.members, { connectionId: connection.id, alias: connection.name, enabled: connection.enabled }],
                sessionIds: { ...room.sessionIds, [connection.id]: `laphiny-${room.id}-${connection.id}` },
                memberSessionKeys: { ...(room.memberSessionKeys ?? {}), [connection.id]: `laphiny-${room.id}-key` },
              })}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.help}>成员启用、别名、头像、加入和移除都在这里完成；聊天页不再维护另一套重复入口。</Text>
      <View style={styles.toolActions}>
        <MiniButton icon="chatbubble-ellipses-outline" label="进入聊天" onPress={() => openFocusedChatRoom(room.id)} />
        <MiniButton icon="trash-outline" label="删除房间" onPress={() => deleteRoom(room.id)} />
        <MiniButton icon="close-outline" label="关闭管理" onPress={closeManagement} />
      </View>
    </View>
  );
}
