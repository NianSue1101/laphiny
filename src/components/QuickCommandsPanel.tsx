import type { ComponentType } from 'react';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import { QUICK_COMMANDS } from '../config/app_config';
import type { QuickCommand } from '../app/app_types';
import { COLLABORATION_RITUALS, getRitualHelpText, type CollaborationRitualId } from '../lib/collaboration_rituals';
import { UX_SLASH_COMMANDS, type UXCommandDefinition } from '../lib/ux';
import type { Room } from '../types';
import { Ionicons } from './SafeIcon';

interface QuickCommandsPanelProps {
  room: Room | null;
  sending: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onRunQuickCommand: (command: QuickCommand) => void;
  onRunRitualCommand: (ritualId: CollaborationRitualId) => void;
  onInsertUxCommand: (command: UXCommandDefinition) => void;
}

export function QuickCommandsPanel({
  room,
  sending,
  styles,
  TextComponent: Text,
  onRunQuickCommand,
  onRunRitualCommand,
  onInsertUxCommand,
}: QuickCommandsPanelProps) {
  if (!room) return null;

  return (
    <View style={styles.quickPanel}>
      <Text style={styles.panelLabel}>快捷指令</Text>
      <View style={styles.quickGrid}>
        {QUICK_COMMANDS.map((command) => {
          const targetInRoom = room.members.some((member) => (
            member.enabled && member.alias.toLowerCase() === command.targetAlias.toLowerCase()
          ));
          const usable = targetInRoom || room.kind === 'direct';
          return (
            <TouchableOpacity
              key={command.id}
              style={[styles.quickCommand, !usable && styles.quickCommandDisabled]}
              onPress={() => onRunQuickCommand(command)}
              disabled={!usable || sending}
            >
              <Ionicons name={command.icon} size={18} color={usable ? '#2563eb' : '#9ca3af'} />
              <View style={styles.quickCommandTextBlock}>
                <Text style={[styles.quickCommandTitle, !usable && styles.quickCommandTitleDisabled]}>{command.label}</Text>
                <Text style={styles.quickCommandTarget}>{usable ? `给 ${command.targetAlias}` : `缺少 ${command.targetAlias}`}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      {room.kind === 'group' ? (
        <>
          <Text style={styles.panelLabel}>协作仪式</Text>
          <Text style={styles.help}>可直接输入 {getRitualHelpText()}，也可以先写任务再点下面按钮。</Text>
          <View style={styles.quickGrid}>
            {COLLABORATION_RITUALS.map((ritual) => (
              <TouchableOpacity
                key={ritual.id}
                style={styles.quickCommand}
                onPress={() => onRunRitualCommand(ritual.id)}
                disabled={sending}
              >
                <Ionicons name={ritual.id === 'council' ? 'people-circle-outline' : ritual.id === 'redteam' ? 'warning-outline' : ritual.id === 'review' ? 'checkmark-done-outline' : 'repeat-outline'} size={18} color="#2563eb" />
                <View style={styles.quickCommandTextBlock}>
                  <Text style={styles.quickCommandTitle}>{ritual.label}</Text>
                  <Text style={styles.quickCommandTarget}>{ritual.mode === 'parallel' ? '并行观点 + 共识' : '接力审查 + 共识'}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.panelLabel}>桌游店 RP</Text>
          <Text style={styles.help}>不用背命令：点击后会把对应指令放进输入框。</Text>
          <View style={styles.quickGrid}>
            {UX_SLASH_COMMANDS.filter((command) => command.kind === 'roleplay').map((command) => (
              <TouchableOpacity key={command.id} style={styles.quickCommand} onPress={() => onInsertUxCommand(command)} disabled={sending}>
                <Ionicons name={command.id === 'rp-stop' ? 'stop-circle-outline' : command.id === 'scene' ? 'map-outline' : command.id === 'ooc' ? 'chatbox-ellipses-outline' : 'game-controller-outline'} size={18} color="#7c3aed" />
                <View style={styles.quickCommandTextBlock}>
                  <Text style={styles.quickCommandTitle}>{command.label}</Text>
                  <Text style={styles.quickCommandTarget}>{command.command}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
