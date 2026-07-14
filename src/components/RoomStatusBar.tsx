import { View } from 'react-native';

import type { DelegationTask, Room } from '../types';
import { getRoomModeLabel } from '../lib/stage4_plus';
import type { RoomStreamSummary } from '../lib/stream_events';
import { StatusToken } from './Primitives';

interface RoomStatusBarProps {
  room: Room | null;
  delegationTasks: DelegationTask[];
  streamSummary?: RoomStreamSummary;
  styles: Record<string, any>;
}

export function RoomStatusBar({ room, delegationTasks, streamSummary, styles }: RoomStatusBarProps) {
  if (!room) return null;

  const enabledCount = room.members.filter((member) => member.enabled).length;
  const openTaskCount = delegationTasks.filter((task) => task.status === 'pending' || task.status === 'running').length;
  const modeLabel = room.roleplay?.enabled
    ? '桌游 RP'
    : room.kind === 'direct'
      ? '单聊'
      : getRoomModeLabel(room.mode);
  const summaryAlias = room.members.find((member) => member.connectionId === room.summaryConnectionId)?.alias;
  const gmAlias = room.members.find((member) => member.connectionId === room.roleplay?.gmConnectionId)?.alias;

  return (
    <View style={styles.roomStatusBar}>
      <StatusToken icon={room.roleplay?.enabled ? 'game-controller-outline' : room.kind === 'group' ? 'git-network-outline' : 'person-outline'} label={`模式 ${modeLabel}`} tone={room.roleplay?.enabled ? 'rp' : 'default'} />
      {room.kind === 'group' ? <StatusToken icon="people-outline" label={`${enabledCount}/${room.members.length} 可用`} tone="default" /> : null}
      {room.roleplay?.enabled ? <StatusToken icon="sparkles-outline" label={`GM ${gmAlias ?? '未选'}`} tone="rp" /> : null}
      {room.kind === 'group' && !room.roleplay?.enabled ? <StatusToken icon="reader-outline" label={`总结 ${summaryAlias ?? '自动'}`} tone="default" /> : null}
      {room.memoryCapsule ? <StatusToken icon="file-tray-full-outline" label={`记忆 v${room.memoryCapsule.version}`} tone="memory" /> : null}
      {room.roleplay?.archive ? <StatusToken icon="map-outline" label={`档案 v${room.roleplay.archive.version}`} tone="rp" /> : null}
      {openTaskCount > 0 ? <StatusToken icon="git-branch-outline" label={`${openTaskCount} 个委托`} tone="warning" /> : null}
      {streamSummary ? <StatusToken icon="pulse-outline" label={`${streamSummary.activeCount} 个 Agent · ${streamSummary.label}`} tone="warning" /> : null}
    </View>
  );
}
