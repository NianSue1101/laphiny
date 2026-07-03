import type { ComponentType, ReactNode } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  type TextProps,
} from 'react-native';

import type { Room, RoomMember } from '../../types';
import { AgentBadge, MiniButton } from '../Primitives';

type Styles = Record<string, any>;

interface ChatRoomHeaderProps {
  room: Room;
  roomDetailsOpen: boolean;
  quickCommandsOpen: boolean;
  roomToolsOpen: boolean;
  collaborationDrawerOpen: boolean;
  isWideLayout: boolean;
  roomDetailsMaxHeight: number;
  selectedTargetIds: string[];
  selectedTargetSet: ReadonlySet<string>;
  contextLimitFallback: number;
  detailsLeadContent: ReactNode;
  detailsTailContent: ReactNode;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  getConnectionAvatarUri: (connectionId: string) => string | undefined;
  getMemberRuntimeStatus: (member: RoomMember) => 'idle' | 'running' | 'delegated' | 'gm' | 'disabled';
  onSelectAllTargets: () => void;
  onToggleTargetSelection: (connectionId: string) => void;
  onInsertMention: (mention: string) => void;
  onToggleQuickCommands: () => void;
  onToggleRoomTools: () => void;
  onToggleCollaborationDrawer: () => void;
  onToggleRoomDetails: () => void;
}

export function ChatRoomHeader({
  room,
  roomDetailsOpen,
  quickCommandsOpen,
  roomToolsOpen,
  collaborationDrawerOpen,
  isWideLayout,
  roomDetailsMaxHeight,
  selectedTargetIds,
  selectedTargetSet,
  contextLimitFallback,
  detailsLeadContent,
  detailsTailContent,
  styles,
  TextComponent,
  getConnectionAvatarUri,
  getMemberRuntimeStatus,
  onSelectAllTargets,
  onToggleTargetSelection,
  onInsertMention,
  onToggleQuickCommands,
  onToggleRoomTools,
  onToggleCollaborationDrawer,
  onToggleRoomDetails,
}: ChatRoomHeaderProps) {
  const Text = TextComponent;
  const enabledMembers = room.members.filter((member) => member.enabled);
  const allTargetsSelected = selectedTargetIds.length === enabledMembers.length;

  return (
    <View style={styles.chatHeader}>
      <View style={styles.roomTitleBlock}>
        <Text style={styles.roomTitle}>{room.name}</Text>
        <Text style={styles.roomSummary}>
          {room.kind === 'group' ? '群聊' : '单聊'} · {room.members.length} 位 Hermes · 上下文 {room.contextLimit ?? contextLimitFallback} 条
        </Text>
      </View>
      <View style={styles.roomHeaderActions}>
        <MiniButton icon={quickCommandsOpen ? 'flash' : 'flash-outline'} label="模式" onPress={onToggleQuickCommands} />
        <MiniButton icon={roomToolsOpen ? 'options' : 'options-outline'} label="工具" onPress={onToggleRoomTools} />
        {isWideLayout && room.kind === 'group' ? (
          <MiniButton
            icon={collaborationDrawerOpen ? 'albums' : 'albums-outline'}
            label={collaborationDrawerOpen ? '收起侧栏' : '协作侧栏'}
            onPress={onToggleCollaborationDrawer}
          />
        ) : null}
        <MiniButton
          icon={roomDetailsOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
          label={roomDetailsOpen ? '收起详情' : '展开详情'}
          onPress={onToggleRoomDetails}
        />
      </View>
      {roomDetailsOpen ? (
        <ScrollView
          style={[styles.roomDetailsScroll, { maxHeight: roomDetailsMaxHeight }]}
          contentContainerStyle={styles.roomDetailsContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {detailsLeadContent}
          <View style={styles.memberChips}>
            {room.kind === 'group' ? (
              <TouchableOpacity
                style={[styles.memberChip, allTargetsSelected && styles.memberChipSelected]}
                onPress={onSelectAllTargets}
              >
                <Text style={styles.memberChipText}>@all</Text>
              </TouchableOpacity>
            ) : null}
            {room.members.map((member) => (
              <TouchableOpacity
                key={member.connectionId}
                style={[
                  styles.memberChip,
                  selectedTargetSet.has(member.connectionId) && styles.memberChipSelected,
                  !member.enabled && styles.memberChipDisabled,
                ]}
                onPress={() => room.kind === 'group' ? onToggleTargetSelection(member.connectionId) : onInsertMention(`@${member.alias}`)}
                disabled={room.kind === 'group' && !member.enabled}
              >
                <AgentBadge
                  alias={member.alias}
                  active={selectedTargetSet.has(member.connectionId)}
                  status={getMemberRuntimeStatus(member)}
                  imageUri={getConnectionAvatarUri(member.connectionId)}
                />
              </TouchableOpacity>
            ))}
          </View>
          {detailsTailContent}
        </ScrollView>
      ) : null}
    </View>
  );
}
