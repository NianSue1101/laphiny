import type { ComponentType, Dispatch, ReactNode, SetStateAction } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { formatDateTime } from '../../app/app_utils';
import {
  STARTER_ROOM_TEMPLATES,
  getRoomModeLabel,
  type StarterRoomTemplate,
} from '../../lib/stage4_plus';
import type { ChatMessage, HermesConnection, Room } from '../../types';
import { AgentBadge, MiniButton, PrimaryButton, SecondaryButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

type Styles = Record<string, any>;

interface RoomsTabProps {
  rooms: Room[];
  enabledConnections: HermesConnection[];
  messagesByRoom: Record<string, ChatMessage[]>;
  groupName: string;
  groupMemberDraftIds: string[];
  managedRoomId: string | null;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  onboardingPanel: ReactNode;
  setGroupName: (name: string) => void;
  setGroupMemberDraftIds: Dispatch<SetStateAction<string[]>>;
  setManagedRoomId: Dispatch<SetStateAction<string | null>>;
  createStarterRoom: (template: StarterRoomTemplate) => void;
  createDirectRoom: (connection: HermesConnection) => void;
  createGroupRoom: () => void;
  openFocusedChatRoom: (roomId: string) => void;
  renderRoomManagementPanel: (room: Room) => ReactNode;
}

export function RoomsTab({
  rooms,
  enabledConnections,
  messagesByRoom,
  groupName,
  groupMemberDraftIds,
  managedRoomId,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  onboardingPanel,
  setGroupName,
  setGroupMemberDraftIds,
  setManagedRoomId,
  createStarterRoom,
  createDirectRoom,
  createGroupRoom,
  openFocusedChatRoom,
  renderRoomManagementPanel,
}: RoomsTabProps) {
  const groupMemberDraftSet = new Set(groupMemberDraftIds);

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
      {onboardingPanel}
      <Text style={styles.sectionTitle}>房间模板</Text>
      <Text style={styles.help}>
        用模板一键创建工作室、审查室、桌游店或日常房间，不包含 API Key。你也可以创建后再微调成员和模式。
      </Text>
      <View style={styles.templateGrid}>
        {STARTER_ROOM_TEMPLATES.map((template) => {
          const iconName = template.mode === 'tabletop'
            ? 'game-controller-outline'
            : template.mode === 'review'
              ? 'shield-checkmark-outline'
              : 'sparkles-outline';

          return (
            <TouchableOpacity
              key={template.id}
              style={styles.templateCard}
              onPress={() => createStarterRoom(template)}
            >
              <View style={styles.squareEventSource}>
                <Ionicons name={iconName} size={16} color="#2563eb" />
                <Text style={styles.conflictItemTitle}>{template.title}</Text>
              </View>
              <Text style={styles.help}>{template.description}</Text>
              <Text style={styles.badge}>{getRoomModeLabel(template.mode)}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.sectionTitle}>创建单聊</Text>
      {enabledConnections.length === 0 ? <Text style={styles.muted}>还没有已启用的 Hermes 连接。</Text> : null}
      {enabledConnections.map((connection) => (
        <View key={connection.id} style={styles.rowCard}>
          <View style={styles.rowMain}>
            <Text style={styles.cardTitle}>{connection.name}</Text>
            <Text style={styles.muted}>{connection.baseUrl}</Text>
          </View>
          <SecondaryButton
            icon="chatbubble-outline"
            label="单聊"
            onPress={() => createDirectRoom(connection)}
          />
        </View>
      ))}

      <Text style={styles.sectionTitle}>创建群聊</Text>
      <TextInput
        style={styles.input}
        value={groupName}
        onChangeText={setGroupName}
        placeholder="群聊名称"
      />
      <View style={styles.roomEditPanel}>
        <View style={styles.conflictHeader}>
          <Text style={styles.panelLabel}>
            选择初始成员 · {groupMemberDraftIds.length}/{enabledConnections.length}
          </Text>
          <View style={styles.stepper}>
            <MiniButton
              icon="checkmark-done-outline"
              label="全选"
              onPress={() => setGroupMemberDraftIds(enabledConnections.map((connection) => connection.id))}
            />
            <MiniButton
              icon="remove-circle-outline"
              label="清空"
              onPress={() => setGroupMemberDraftIds([])}
            />
          </View>
        </View>
        <View style={styles.memberChips}>
          {enabledConnections.map((connection) => (
            <TouchableOpacity
              key={connection.id}
              style={[
                styles.memberChip,
                groupMemberDraftSet.has(connection.id) && styles.memberChipSelected,
              ]}
              onPress={() => setGroupMemberDraftIds((current) => (
                current.includes(connection.id)
                  ? current.filter((id) => id !== connection.id)
                  : [...current, connection.id]
              ))}
            >
              <AgentBadge
                alias={connection.name}
                active={groupMemberDraftSet.has(connection.id)}
                imageUri={connection.avatarUri}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={styles.help}>
        群聊只会加入上面选中的连接。发送时使用 @成员名、@all/@all-seq，或 /council /redteam /review /retro 启动协作仪式。
      </Text>
      <PrimaryButton
        icon="people-outline"
        label="创建群聊"
        onPress={createGroupRoom}
        disabled={groupMemberDraftIds.length < 2}
      />

      <Text style={styles.sectionTitle}>已有房间</Text>
      <Text style={styles.help}>
        这里是唯一的房间管理入口：管理会在当前列表原地展开，不会再跳到聊天页旧详情。
      </Text>
      {rooms.map((room) => {
        const managing = managedRoomId === room.id;
        return (
          <View key={room.id} style={[styles.card, managing && styles.managedRoomCard]}>
            <TouchableOpacity onPress={() => openFocusedChatRoom(room.id)}>
              <Text style={styles.cardTitle}>{room.name}</Text>
              <Text style={styles.muted}>
                {room.kind === 'group' ? '群聊' : '单聊'} ·{' '}
                {room.members.map((member) => `${member.enabled ? '' : '停用:'}${member.alias}`).join('、')}
              </Text>
              <Text style={styles.help}>
                {(messagesByRoom[room.id] ?? []).length} 条消息 · 更新于 {formatDateTime(room.updatedAt)}
              </Text>
            </TouchableOpacity>
            <View style={styles.buttonRow}>
              <SecondaryButton
                icon="chatbubble-ellipses-outline"
                label="进入"
                onPress={() => openFocusedChatRoom(room.id)}
              />
              <SecondaryButton
                icon={managing ? 'chevron-up-outline' : 'options-outline'}
                label={managing ? '收起管理' : '管理'}
                onPress={() => setManagedRoomId((current) => (current === room.id ? null : room.id))}
              />
            </View>
            {managing ? renderRoomManagementPanel(room) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}
