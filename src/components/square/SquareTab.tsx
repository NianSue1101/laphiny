import type { ComponentType } from 'react';
import { ScrollView, View, type TextProps } from 'react-native';

import { formatDateTime, getSquareEventIcon } from '../../app/app_utils';
import { buildSoulDailyDigest } from '../../lib/square_insights';
import type { SoulRelationEdge } from '../../lib/stage4_plus';
import type {
  AgentProfileVersion,
  ChatMessage,
  CollaborationEvent,
  DelegationTask,
  HermesConnection,
  Room,
  SquareEvent,
  TeamTemplate,
} from '../../types';
import { EmptyState } from '../Primitives';
import { MarkdownText } from '../MarkdownText';
import { SoulRelationsPanel } from '../SoulRelationsPanel';
import { Ionicons } from '../SafeIcon';
import { CollaborationArchivePanel } from './CollaborationArchivePanel';
import { SoulDailyPanel } from './SoulDailyPanel';

type SquareTabProps = {
  collaborationEvents: CollaborationEvent[];
  connections: HermesConnection[];
  delegationTasks: DelegationTask[];
  latestProfileVersions: AgentProfileVersion[];
  messagesByRoom: Record<string, ChatMessage[]>;
  rooms: Room[];
  selectedFontFamily?: string;
  soulRelations: SoulRelationEdge[];
  squareEvents: SquareEvent[];
  teamTemplates: TeamTemplate[];
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  getDelegationTaskStatusStyle: (status: DelegationTask['status']) => any;
  onDeleteTeamTemplate: (template: TeamTemplate) => void;
  onOpenRoom: (roomId: string) => void;
  onOpenRoomManagement: (roomId: string) => void;
  onRestoreProfileVersion: (version: AgentProfileVersion) => void;
};

export function SquareTab({
  collaborationEvents,
  connections,
  delegationTasks,
  latestProfileVersions,
  messagesByRoom,
  rooms,
  selectedFontFamily,
  soulRelations,
  squareEvents,
  teamTemplates,
  styles,
  TextComponent: Text,
  getDelegationTaskStatusStyle,
  onDeleteTeamTemplate,
  onOpenRoom,
  onOpenRoomManagement,
  onRestoreProfileVersion,
}: SquareTabProps) {
  const events = [...squareEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const dailyDigest = buildSoulDailyDigest({ rooms, connections, messagesByRoom, collaborationEvents, delegationTasks });

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
      <View style={styles.squareHeader}>
        <View>
          <Text style={styles.sectionTitle}>灵庭</Text>
          <Text style={styles.help}>沉淀 Hermes 回复、委托任务、房间记忆与 Soul 小队动态。</Text>
        </View>
        <Text style={styles.squareCount}>{events.length} 条事件</Text>
      </View>

      <SoulDailyPanel
        dailyDigest={dailyDigest}
        delegationTasks={delegationTasks}
        rooms={rooms}
        styles={styles}
        TextComponent={Text}
        getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
        onOpenRoom={onOpenRoom}
        onOpenRoomManagement={onOpenRoomManagement}
      />

      <CollaborationArchivePanel
        collaborationEvents={collaborationEvents}
        delegationTasks={delegationTasks}
        teamTemplates={teamTemplates}
        latestProfileVersions={latestProfileVersions}
        styles={styles}
        TextComponent={Text}
        getDelegationTaskStatusStyle={getDelegationTaskStatusStyle}
        onDeleteTeamTemplate={onDeleteTeamTemplate}
        onRestoreProfileVersion={onRestoreProfileVersion}
      />

      <SoulRelationsPanel relations={soulRelations} styles={styles} TextComponent={Text} />

      {events.length === 0 ? (
        <EmptyState
          icon="planet-outline"
          title="灵庭还没有事件"
          body="当 Hermes 回复、系统提示、委托任务或同步日志出现时，灵庭会沉淀为 Soul 小队的活动时间线。"
        />
      ) : null}

      {events.map((event) => (
        <View key={event.id} style={styles.squareEvent}>
          <View style={styles.squareEventHeader}>
            <View style={styles.squareEventSource}>
              <Ionicons name={getSquareEventIcon(event.kind)} size={16} color="#2563eb" />
              <Text style={styles.squareEventTitle}>{event.title}</Text>
            </View>
            <Text style={styles.status}>{formatDateTime(event.createdAt)}</Text>
          </View>
          <Text style={styles.squareEventMeta}>
            {event.source}{event.roomName ? ` · ${event.roomName}` : ''}{event.target ? ` → ${event.target}` : ''}
          </Text>
          <MarkdownText content={event.body} fontFamily={selectedFontFamily} />
        </View>
      ))}
    </ScrollView>
  );
}
