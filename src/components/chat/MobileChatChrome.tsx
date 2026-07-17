import { useState, type ComponentType, type ReactNode } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  type TextProps,
} from 'react-native';

import { formatDateTime } from '../../app/app_utils';
import { summarizeRoomMemory } from '../../lib/room_memory';
import type { Room } from '../../types';
import { MarkdownText } from '../MarkdownText';
import { DisclosureSection, MiniButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

type Styles = Record<string, any>;

interface FocusedChatHeaderProps {
  room: Room;
  isDarkMode: boolean;
  detailsOpen: boolean;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  onBack: () => void;
  onToggleDetails: () => void;
}

export function FocusedChatHeader({
  room,
  isDarkMode,
  detailsOpen,
  styles,
  TextComponent,
  onBack,
  onToggleDetails,
}: FocusedChatHeaderProps) {
  const Text = TextComponent;

  return (
    <View style={[styles.focusedChatHeader, isDarkMode && styles.focusedChatHeaderDark]}>
      <TouchableOpacity style={styles.focusedBackButton} onPress={onBack} accessibilityRole="button">
        <Ionicons name="chevron-back" size={22} color={isDarkMode ? '#e5e7eb' : '#111827'} />
        <Text style={[styles.focusedBackText, isDarkMode && styles.titleDark]}>返回</Text>
      </TouchableOpacity>
      <View style={styles.focusedChatTitleBlock}>
        <Text style={[styles.focusedChatTitle, isDarkMode && styles.titleDark]} numberOfLines={1}>{room.name}</Text>
        <Text style={[styles.focusedChatMeta, isDarkMode && styles.subtitleDark]} numberOfLines={1}>
          {room.kind === 'group' ? '群聊' : '单聊'} · {room.members.filter((member) => member.enabled).length}/{room.members.length}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.focusedDetailsButton, detailsOpen && styles.focusedDetailsButtonActive]}
        onPress={onToggleDetails}
        accessibilityRole="button"
        accessibilityLabel={detailsOpen ? '关闭房间详情' : '打开房间详情'}
      >
        <Ionicons name={detailsOpen ? 'close-outline' : 'albums-outline'} size={18} color={detailsOpen ? '#ffffff' : '#2563eb'} />
      </TouchableOpacity>
    </View>
  );
}

interface MobileRoomDetailsDrawerProps {
  room: Room;
  isDarkMode: boolean;
  isWideLayout: boolean;
  selectedFontFamily?: string;
  memoryGenerating: boolean;
  leadContent: ReactNode;
  roomGrowthPanel: ReactNode;
  taskBoardPanel: ReactNode;
  collaborationDashboard: ReactNode;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  onClose: () => void;
  onConfirmPendingMemory: () => void;
  onDiscardPendingMemory: () => void;
  onGenerateMemory: () => void;
  onExportCollaborationReport: () => void;
}

export function MobileRoomDetailsDrawer({
  room,
  isDarkMode,
  isWideLayout,
  selectedFontFamily,
  memoryGenerating,
  leadContent,
  roomGrowthPanel,
  taskBoardPanel,
  collaborationDashboard,
  styles,
  TextComponent,
  onClose,
  onConfirmPendingMemory,
  onDiscardPendingMemory,
  onGenerateMemory,
  onExportCollaborationReport,
}: MobileRoomDetailsDrawerProps) {
  const Text = TextComponent;
  const [openSection, setOpenSection] = useState<'memory' | 'growth' | 'collaboration' | null>(
    () => room.pendingMemoryCapsule ? 'memory' : null,
  );

  function toggleSection(section: NonNullable<typeof openSection>) {
    setOpenSection((current) => current === section ? null : section);
  }

  return (
    <View style={styles.mobileDetailsLayer} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.mobileDetailsBackdrop}
        activeOpacity={1}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="关闭房间详情"
      />
      <View style={[styles.mobileDetailsCard, isDarkMode && styles.mobileDetailsCardDark]}>
        <View style={styles.mobileDetailsHeader}>
          <View style={styles.rowMain}>
            <Text style={[styles.cardTitle, isDarkMode && styles.titleDark]} numberOfLines={1}>房间详情</Text>
            <Text style={[styles.help, isDarkMode && styles.subtitleDark]} numberOfLines={1}>左滑打开 · 右滑或点击空白关闭</Text>
          </View>
          {room.kind === 'group' ? (
            <TouchableOpacity
              style={styles.sidebarIconButton}
              onPress={onExportCollaborationReport}
              accessibilityRole="button"
              accessibilityLabel="导出脱敏协作报告"
            >
              <Ionicons name="shield-checkmark-outline" size={18} color="#2563eb" />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.sidebarIconButton} onPress={onClose} accessibilityRole="button" accessibilityLabel="关闭房间详情">
            <Ionicons name="close" size={18} color="#4b5563" />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.mobileDetailsScroll}
          contentContainerStyle={styles.mobileDetailsContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
        >
          {leadContent}

          {room.kind === 'group' || room.lastSummary ? (
            <DisclosureSection
              icon="library-outline"
              title="记忆与共识"
              summary={room.pendingMemoryCapsule
                ? `有待确认的 v${room.pendingMemoryCapsule.version} 草稿`
                : room.memoryCapsule
                  ? `已沉淀 v${room.memoryCapsule.version} 房间记忆`
                  : room.lastSummary
                    ? `最近由 ${room.lastSummary.authorName} 总结`
                    : '尚未生成房间记忆'}
              open={openSection === 'memory'}
              onToggle={() => toggleSection('memory')}
            >
              {room.lastSummary ? (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryTitle}>最近共识 · {room.lastSummary.authorName}</Text>
                  <MarkdownText content={room.lastSummary.content} fontFamily={selectedFontFamily} />
                </View>
              ) : null}
              {room.kind === 'group' ? (
                <View style={styles.roomEditPanel}>
                  <Text style={styles.panelLabel}>房间记忆胶囊</Text>
                  {room.pendingMemoryCapsule ? (
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryTitle}>待确认记忆草稿 · v{room.pendingMemoryCapsule.version}</Text>
                      <Text style={styles.help}>{summarizeRoomMemory(room.pendingMemoryCapsule)}</Text>
                      <View style={styles.toolActions}>
                        <MiniButton icon="checkmark-circle-outline" label="确认沉淀" onPress={onConfirmPendingMemory} />
                        <MiniButton icon="close-circle-outline" label="丢弃草稿" tone="danger" onPress={onDiscardPendingMemory} />
                      </View>
                    </View>
                  ) : null}
                  {room.memoryCapsule ? (
                    <View style={styles.summaryBox}>
                      <Text style={styles.summaryTitle}>v{room.memoryCapsule.version} · {room.memoryCapsule.authorName ?? 'Laphiny'} · {formatDateTime(room.memoryCapsule.updatedAt)}</Text>
                      <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
                    </View>
                  ) : (
                    <Text style={styles.help}>还没有房间记忆。生成并确认后，会进入后续群聊上下文。</Text>
                  )}
                  <View style={styles.toolActions}>
                    <MiniButton
                      icon="sparkles-outline"
                      label={memoryGenerating ? '生成中...' : room.memoryCapsule ? '更新记忆' : '生成记忆'}
                      onPress={onGenerateMemory}
                    />
                  </View>
                </View>
              ) : null}
            </DisclosureSection>
          ) : null}

          <DisclosureSection
            icon="leaf-outline"
            title="成长与知识"
            summary="知识库、黑板、决策与房间成长"
            open={openSection === 'growth'}
            onToggle={() => toggleSection('growth')}
          >
            {roomGrowthPanel}
          </DisclosureSection>

          <DisclosureSection
            icon="people-outline"
            title="任务与协作"
            summary="任务看板、委托进度和协作事件"
            open={openSection === 'collaboration'}
            onToggle={() => toggleSection('collaboration')}
          >
            {taskBoardPanel}
            {!isWideLayout ? collaborationDashboard : null}
          </DisclosureSection>
        </ScrollView>
      </View>
    </View>
  );
}
