import type { ComponentType } from 'react';
import { Modal, TouchableOpacity, View, type TextProps } from 'react-native';

import { DEFAULT_DELEGATIONS_PER_ROUND } from '../../config/app_config';
import type { ChatNoticeAction } from '../../lib/chat_notice_actions';
import type { Room } from '../../types';
import { MiniButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

export function ChatQuickSettingsSheet({
  action,
  room,
  sending,
  styles,
  TextComponent: Text,
  onClose,
  onUpdateDelegationsPerRound,
  onToggleAutoDelegation,
  onToggleToolDelegation,
  onConfirmMemory,
  onDiscardMemory,
  onGenerateMemory,
  onContinueGoal,
  onAdjustGoal,
  onToggleRoleplay,
}: {
  action: ChatNoticeAction | null;
  room?: Room | null;
  sending: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onClose: () => void;
  onUpdateDelegationsPerRound: (delta: number) => void;
  onToggleAutoDelegation: () => void;
  onToggleToolDelegation: () => void;
  onConfirmMemory: () => void;
  onDiscardMemory: () => void;
  onGenerateMemory: () => void;
  onContinueGoal: () => void;
  onAdjustGoal: () => void;
  onToggleRoleplay: () => void;
}) {
  if (!action || !room) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.chatQuickSettingsOverlay}>
        <TouchableOpacity style={styles.chatQuickSettingsBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.chatQuickSettingsSheet}>
          <View style={styles.chatQuickSettingsHeader}>
            <View style={styles.chatQuickSettingsTitleRow}>
              <View style={styles.chatQuickSettingsIcon}>
                <Ionicons name="options-outline" size={18} color="#be5675" />
              </View>
              <View style={styles.rowMain}>
                <Text style={styles.panelLabel}>{action.title}</Text>
                <Text style={styles.help}>{action.description}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.chatQuickSettingsClose} onPress={onClose}>
              <Ionicons name="close-outline" size={20} color="#4b5563" />
            </TouchableOpacity>
          </View>

          {action.id === 'delegation-limit' ? (
            <View style={styles.chatQuickSettingsBody}>
              <Text style={styles.help}>当前房间 · 普通模式</Text>
              <View style={styles.chatQuickSettingsStepper}>
                <MiniButton icon="remove-outline" label="减少" onPress={() => onUpdateDelegationsPerRound(-1)} />
                <View style={styles.chatQuickSettingsValueBox}>
                  <Text style={styles.chatQuickSettingsValue}>{room.maxDelegationsPerRound ?? DEFAULT_DELEGATIONS_PER_ROUND}</Text>
                  <Text style={styles.chatQuickSettingsValueLabel}>单 / 每轮</Text>
                </View>
                <MiniButton icon="add-outline" label="增加" onPress={() => onUpdateDelegationsPerRound(1)} />
              </View>
              <Text style={styles.help}>这里只控制普通聊天；目标模式仍保留独立的安全上限。</Text>
            </View>
          ) : null}

          {action.id === 'delegation-tools' ? (
            <View style={styles.chatQuickSettingsBody}>
              <View style={styles.toolActions}>
                <MiniButton
                  icon={room.autoDelegationEnabled === false ? 'flash-off-outline' : 'flash-outline'}
                  label={room.autoDelegationEnabled === false ? '自动委托：关' : '自动委托：开'}
                  active={room.autoDelegationEnabled !== false}
                  onPress={onToggleAutoDelegation}
                />
                <MiniButton
                  icon={room.agentToolDelegationEnabled === false ? 'construct-outline' : 'construct'}
                  label={room.agentToolDelegationEnabled === false ? '工具委托：关' : '工具委托：开'}
                  active={room.agentToolDelegationEnabled !== false}
                  onPress={onToggleToolDelegation}
                />
              </View>
              <Text style={styles.help}>工具调用无有效任务时，可临时关闭工具委托，继续使用兼容委托解析。</Text>
            </View>
          ) : null}

          {action.id === 'memory' ? (
            <View style={styles.chatQuickSettingsBody}>
              <Text style={styles.help} numberOfLines={4}>
                {room.pendingMemoryCapsule
                  ? `v${room.pendingMemoryCapsule.version} · ${room.pendingMemoryCapsule.goal || '尚未填写目标'}`
                  : '当前没有待确认的记忆草案。'}
              </Text>
              <View style={styles.toolActions}>
                {room.pendingMemoryCapsule ? <MiniButton icon="checkmark-outline" label="确认沉淀" active onPress={onConfirmMemory} /> : null}
                {room.pendingMemoryCapsule ? <MiniButton icon="trash-outline" label="丢弃草案" tone="danger" onPress={onDiscardMemory} /> : null}
                <MiniButton icon="sparkles-outline" label="重新生成" onPress={onGenerateMemory} />
              </View>
            </View>
          ) : null}

          {action.id === 'goal' ? (
            <View style={styles.chatQuickSettingsBody}>
              <Text style={styles.help} numberOfLines={4}>
                {room.activeGoal ? room.activeGoal.goal : '当前房间没有进行中的目标。'}
              </Text>
              {room.activeGoal ? (
                <View style={styles.toolActions}>
                  <MiniButton icon="play-outline" label="继续目标" active disabled={sending} onPress={onContinueGoal} />
                  <MiniButton icon="create-outline" label="放入输入框调整" disabled={sending} onPress={onAdjustGoal} />
                </View>
              ) : null}
            </View>
          ) : null}

          {action.id === 'roleplay' ? (
            <View style={styles.chatQuickSettingsBody}>
              <Text style={styles.help}>当前状态：{room.roleplay?.enabled ? 'RP 已开启' : '普通协作模式'}</Text>
              <View style={styles.toolActions}>
                <MiniButton
                  icon={room.roleplay?.enabled ? 'game-controller' : 'game-controller-outline'}
                  label={room.roleplay?.enabled ? '关闭 RP' : '重新开启 RP'}
                  active={Boolean(room.roleplay?.enabled)}
                  onPress={onToggleRoleplay}
                />
              </View>
            </View>
          ) : null}

          <TouchableOpacity style={styles.chatQuickSettingsDone} onPress={onClose}>
            <Text style={styles.chatQuickSettingsDoneText}>完成，回到聊天</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
