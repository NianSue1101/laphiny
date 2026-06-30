import type { ComponentType } from 'react';
import { View, type TextProps } from 'react-native';

import type { Room } from '../types';
import { summarizeRoleplayArchive } from '../lib/stage4_plus';
import { Ionicons } from './SafeIcon';

interface RoleplaySceneCardProps {
  room: Room | null;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
}

export function RoleplaySceneCard({ room, styles, TextComponent: Text }: RoleplaySceneCardProps) {
  if (!room?.roleplay?.enabled) return null;

  const roleplay = room.roleplay;
  const gmAlias = room.members.find((member) => member.connectionId === roleplay.gmConnectionId)?.alias ?? 'GM';

  return (
    <View style={styles.rpSceneCard}>
      <View style={styles.rpSceneHeader}>
        <View style={styles.squareEventSource}>
          <Ionicons name="game-controller-outline" size={16} color="#7c3aed" />
          <Text style={styles.rpSceneTitle}>{roleplay.genre || '自由冒险'} · {gmAlias} 主持</Text>
        </View>
        <Text style={styles.rpSceneBadge}>{roleplay.includeAllAgents === false ? '仅 GM' : '全员入戏'}</Text>
      </View>
      <Text style={styles.rpSceneTone}>{roleplay.tone || '沉浸、轻桌游、重角色互动'}</Text>
      {roleplay.currentScene ? <Text style={styles.rpSceneBody} numberOfLines={3}>{roleplay.currentScene}</Text> : <Text style={styles.rpSceneBody}>还没有当前场景。用 /scene 写下开场，或直接用 /rp 开始行动。</Text>}
      {roleplay.archive ? <Text style={styles.rpSceneArchive}>档案：{summarizeRoleplayArchive(roleplay.archive)}</Text> : null}
    </View>
  );
}
