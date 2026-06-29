import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { Room } from '../types';
import { formatDateTime } from '../app/app_utils';
import { summarizeRoleplayArchive } from '../lib/stage4_plus';
import { MiniButton } from './Primitives';

interface RoleplayArchivePanelProps {
  room: Room | null;
  generating: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onGenerate: () => void;
  onClear: () => void;
}

export function RoleplayArchivePanel({
  room,
  generating,
  styles,
  TextComponent: Text,
  onGenerate,
  onClear,
}: RoleplayArchivePanelProps) {
  if (!room?.roleplay?.enabled) return null;
  const archive = room.roleplay.archive;

  return (
    <View style={styles.roomEditPanel}>
      <View style={styles.syncHeader}>
        <View>
          <Text style={styles.panelLabel}>RP 剧本档案</Text>
          <Text style={styles.help}>长期记录世界观、章节、NPC、地点、道具、线索、谜团、玩家选择和 GM 幕后笔记。</Text>
        </View>
        <View style={styles.buttonRowCompact}>
          <MiniButton icon="file-tray-full-outline" label={generating ? '整理中...' : '整理档案'} onPress={onGenerate} />
          {archive ? <MiniButton icon="trash-outline" label="清空" onPress={onClear} /> : null}
        </View>
      </View>
      {archive ? (
        <View style={styles.archiveCard}>
          <Text style={styles.summaryTitle}>{archive.title} · 第 {archive.chapter} 章</Text>
          <Text style={styles.help}>{summarizeRoleplayArchive(archive)} · 更新于 {formatDateTime(archive.updatedAt)}</Text>
          <Text style={styles.diagnosticMessage}>主线：{archive.currentQuest}</Text>
          <Text style={styles.help}>NPC：{archive.npcs.slice(0, 4).join('、') || '暂无'} </Text>
          <Text style={styles.help}>线索：{archive.clues.slice(0, 4).join('、') || '暂无'} </Text>
          {archive.gmNotes ? <Text style={styles.conflictWarning}>GM 幕后笔记：{archive.gmNotes}</Text> : null}
        </View>
      ) : <Text style={styles.help}>还没有 RP 剧本档案。开始几轮剧情后，点击“整理档案”。</Text>}
    </View>
  );
}
