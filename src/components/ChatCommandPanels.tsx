import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextProps } from 'react-native';

import type { Room } from '../types';
import { getUxCommandKindLabel, UX_SLASH_COMMANDS, type UXCommandDefinition } from '../lib/ux';
import { Ionicons } from './SafeIcon';

interface ComposerModeBarProps {
  room: Room | null;
  quickCommandsOpen: boolean;
  isWideLayout: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onToggleQuickCommands: () => void;
  onInsertCommand: (command: UXCommandDefinition) => void;
}

export function ComposerModeBar({
  room,
  quickCommandsOpen,
  isWideLayout,
  styles,
  TextComponent: Text,
  onToggleQuickCommands,
  onInsertCommand,
}: ComposerModeBarProps) {
  if (!room) return null;
  const items = room.kind === 'group'
    ? UX_SLASH_COMMANDS.filter((item) => ['council', 'redteam', 'review', 'retro', 'rp', 'scene', 'ooc'].includes(item.id))
    : UX_SLASH_COMMANDS.filter((item) => item.id === 'rp' || item.id === 'ooc');

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modeShortcutList}>
      <TouchableOpacity style={[styles.modeShortcut, quickCommandsOpen && styles.modeShortcutActive]} onPress={onToggleQuickCommands}>
        <Ionicons name="apps-outline" size={14} color={quickCommandsOpen ? '#ffffff' : '#4b5563'} />
        <Text style={[styles.modeShortcutText, quickCommandsOpen && styles.modeShortcutTextActive]}>
          {quickCommandsOpen ? '收起模式' : '协作模式'}
        </Text>
      </TouchableOpacity>
      {quickCommandsOpen ? items.slice(0, isWideLayout ? 7 : 5).map((command) => (
        <TouchableOpacity key={command.id} style={styles.modeShortcut} onPress={() => {
          onInsertCommand(command);
          onToggleQuickCommands();
        }}>
          <Ionicons name={command.kind === 'roleplay' ? 'game-controller-outline' : 'sparkles-outline'} size={14} color="#4b5563" />
          <Text style={styles.modeShortcutText}>{command.command}</Text>
        </TouchableOpacity>
      )) : null}
    </ScrollView>
  );
}

interface SlashCommandPanelProps {
  room: Room | null;
  suggestions: UXCommandDefinition[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onInsertCommand: (command: UXCommandDefinition) => void;
}

export function SlashCommandPanel({
  room,
  suggestions,
  styles,
  TextComponent: Text,
  onInsertCommand,
}: SlashCommandPanelProps) {
  if (!room || suggestions.length === 0) return null;

  return (
    <View style={styles.slashPanel}>
      <Text style={styles.panelLabel}>指令补全</Text>
      {suggestions.map((command) => (
        <TouchableOpacity key={command.id} style={styles.slashCommandRow} onPress={() => onInsertCommand(command)}>
          <View style={styles.slashCommandIcon}>
            <Ionicons name={command.kind === 'roleplay' ? 'game-controller-outline' : command.kind === 'memory' ? 'file-tray-full-outline' : 'people-circle-outline'} size={16} color="#2563eb" />
          </View>
          <View style={styles.rowMain}>
            <Text style={styles.slashCommandTitle}>{command.command} · {command.label}</Text>
            <Text style={styles.help}>{getUxCommandKindLabel(command.kind)} · {command.description}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}
