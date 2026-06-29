import type { ComponentType } from 'react';
import { View, type TextInputProps, type TextProps } from 'react-native';

import type { Room, RoomBlackboardItemStatus, RoomDecisionRecordStatus } from '../types';
import type { RoomGrowthSummary } from '../lib/room_growth';
import type { SoulRelationEdge } from '../lib/stage4_plus';
import { formatDateTime } from '../app/app_utils';
import { getBlackboardStatusLabel, getDecisionStatusLabel } from '../app/app_status_labels';
import { AgentAvatar, HealthMetric, MiniButton, StatusToken } from './Primitives';

interface RoomGrowthPanelProps {
  room: Room | null;
  growth: RoomGrowthSummary | null;
  soulRelations: SoulRelationEdge[];
  knowledgeTitleDraft: string;
  knowledgeBodyDraft: string;
  blackboardDraft: string;
  decisionTitleDraft: string;
  decisionRationaleDraft: string;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  onChangeKnowledgeTitle: (value: string) => void;
  onChangeKnowledgeBody: (value: string) => void;
  onAddKnowledgeItem: () => void;
  onRemoveKnowledgeItem: (id: string) => void;
  onChangeBlackboardDraft: (value: string) => void;
  onAddBlackboardItem: () => void;
  onUpdateBlackboardStatus: (id: string, status: RoomBlackboardItemStatus) => void;
  onRemoveBlackboardItem: (id: string) => void;
  onChangeDecisionTitle: (value: string) => void;
  onChangeDecisionRationale: (value: string) => void;
  onAddDecisionRecord: () => void;
  onUpdateDecisionStatus: (id: string, status: RoomDecisionRecordStatus) => void;
  onRemoveDecisionRecord: (id: string) => void;
}

export function RoomGrowthPanel({
  room,
  growth,
  soulRelations,
  knowledgeTitleDraft,
  knowledgeBodyDraft,
  blackboardDraft,
  decisionTitleDraft,
  decisionRationaleDraft,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  onChangeKnowledgeTitle,
  onChangeKnowledgeBody,
  onAddKnowledgeItem,
  onRemoveKnowledgeItem,
  onChangeBlackboardDraft,
  onAddBlackboardItem,
  onUpdateBlackboardStatus,
  onRemoveBlackboardItem,
  onChangeDecisionTitle,
  onChangeDecisionRationale,
  onAddDecisionRecord,
  onUpdateDecisionStatus,
  onRemoveDecisionRecord,
}: RoomGrowthPanelProps) {
  if (!room || !growth) return null;

  const knowledgeItems = [...(room.knowledgeBase ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const blackboardItems = [...(room.blackboardItems ?? [])].sort((a, b) => {
    const statusRank = (item: typeof a) => item.status === 'pinned' ? 2 : item.status === 'open' ? 1 : 0;
    return statusRank(b) - statusRank(a) || b.updatedAt.localeCompare(a.updatedAt);
  });
  const decisionRecords = [...(room.decisionRecords ?? [])].sort((a, b) => {
    const statusRank = (item: typeof a) => item.status === 'active' ? 1 : 0;
    return statusRank(b) - statusRank(a) || b.updatedAt.localeCompare(a.updatedAt);
  });

  return (
    <View style={styles.roomEditPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.panelLabel}>房间成长层</Text>
          <Text style={styles.help}>把几轮协作后的稳定知识、开放问题、决策和 Agent 关系沉淀下来；确认后的内容会进入后续群聊上下文。</Text>
        </View>
        <StatusToken icon="leaf-outline" label={growth.label} tone="memory" />
      </View>
      <View style={styles.healthMetricRow}>
        <HealthMetric label="知识" value={growth.knowledgeCount} tone={growth.knowledgeCount ? 'ok' : 'unknown'} />
        <HealthMetric label="黑板" value={growth.blackboardOpenCount} tone={growth.blackboardOpenCount ? 'checking' : 'unknown'} />
        <HealthMetric label="决策" value={growth.decisionCount} tone={growth.decisionCount ? 'ok' : 'unknown'} />
        <HealthMetric label="草案" value={growth.pendingMemory ? 1 : 0} tone={growth.pendingMemory ? 'checking' : 'unknown'} />
      </View>

      <Text style={styles.panelLabel}>房间知识库</Text>
      <TextInput style={styles.input} value={knowledgeTitleDraft} onChangeText={onChangeKnowledgeTitle} placeholder="知识标题，例如：发布约束 / 用户偏好 / 项目定位" />
      <TextInput
        style={[styles.input, styles.jsonPasteInput]}
        multiline
        value={knowledgeBodyDraft}
        onChangeText={onChangeKnowledgeBody}
        placeholder="稳定事实、偏好、约束或交接信息"
        textAlignVertical="top"
      />
      <View style={styles.toolActions}>
        <MiniButton icon="add-circle-outline" label="加入知识库" onPress={onAddKnowledgeItem} />
      </View>
      {knowledgeItems.length ? knowledgeItems.slice(0, 8).map((item) => (
        <View key={item.id} style={styles.conflictItem}>
          <View style={styles.conflictHeader}>
            <View style={styles.rowMain}>
              <Text style={styles.conflictItemTitle}>{item.title}</Text>
              <Text style={styles.help}>{item.source} · {formatDateTime(item.updatedAt)}{item.tags.length ? ` · ${item.tags.join('、')}` : ''}</Text>
              <Text style={styles.diagnosticMessage}>{item.body}</Text>
            </View>
            <MiniButton icon="trash-outline" label="删除" onPress={() => onRemoveKnowledgeItem(item.id)} />
          </View>
        </View>
      )) : <Text style={styles.help}>还没有结构化知识。确认记忆草案或手动添加后，这里会成为房间的长期参考层。</Text>}

      <Text style={styles.panelLabel}>协作黑板</Text>
      <View style={styles.inlineFormRow}>
        <TextInput style={[styles.input, styles.inlineInput]} value={blackboardDraft} onChangeText={onChangeBlackboardDraft} placeholder="开放问题、待办、下一步动作" />
        <MiniButton icon="add-circle-outline" label="贴上" onPress={onAddBlackboardItem} />
      </View>
      {blackboardItems.length ? blackboardItems.slice(0, 10).map((item) => (
        <View key={item.id} style={styles.conflictItem}>
          <View style={styles.conflictHeader}>
            <View style={styles.rowMain}>
              <Text style={styles.conflictItemTitle}>{getBlackboardStatusLabel(item.status)} · {item.text}</Text>
              <Text style={styles.help}>{item.authorName} · {formatDateTime(item.updatedAt)}</Text>
            </View>
            <View style={styles.buttonRowCompact}>
              <MiniButton icon="pin-outline" label="置顶" onPress={() => onUpdateBlackboardStatus(item.id, 'pinned')} />
              <MiniButton icon="checkmark-outline" label="完成" onPress={() => onUpdateBlackboardStatus(item.id, 'resolved')} />
              <MiniButton icon="trash-outline" label="删" onPress={() => onRemoveBlackboardItem(item.id)} />
            </View>
          </View>
        </View>
      )) : <Text style={styles.help}>黑板适合放还没进入正式结论的开放事项。</Text>}

      <Text style={styles.panelLabel}>决策记录</Text>
      <TextInput style={styles.input} value={decisionTitleDraft} onChangeText={onChangeDecisionTitle} placeholder="决策标题，例如：采用本地优先架构" />
      <TextInput
        style={[styles.input, styles.jsonPasteInput]}
        multiline
        value={decisionRationaleDraft}
        onChangeText={onChangeDecisionRationale}
        placeholder="决策理由、取舍和适用边界"
        textAlignVertical="top"
      />
      <View style={styles.toolActions}>
        <MiniButton icon="ribbon-outline" label="记录决策" onPress={onAddDecisionRecord} />
      </View>
      {decisionRecords.length ? decisionRecords.slice(0, 8).map((item) => (
        <View key={item.id} style={styles.conflictItem}>
          <View style={styles.conflictHeader}>
            <View style={styles.rowMain}>
              <Text style={styles.conflictItemTitle}>{getDecisionStatusLabel(item.status)} · {item.title}</Text>
              <Text style={styles.help}>{item.source}{item.ownerName ? ` · ${item.ownerName}` : ''} · {formatDateTime(item.updatedAt)}</Text>
              {item.rationale ? <Text style={styles.diagnosticMessage}>{item.rationale}</Text> : null}
            </View>
            <View style={styles.buttonRowCompact}>
              <MiniButton icon="archive-outline" label="过期" onPress={() => onUpdateDecisionStatus(item.id, 'superseded')} />
              <MiniButton icon="trash-outline" label="删" onPress={() => onRemoveDecisionRecord(item.id)} />
            </View>
          </View>
        </View>
      )) : <Text style={styles.help}>重要结论放到决策记录里，后续 Agent 会把它当作稳定边界，而不是普通聊天噪音。</Text>}

      <Text style={styles.panelLabel}>本房间 Soul 关系图</Text>
      {soulRelations.length ? soulRelations.slice(0, 6).map((edge) => (
        <View key={edge.id} style={styles.relationCard}>
          <View style={styles.relationHeader}>
            <AgentAvatar alias={edge.fromName} size={24} />
            <Text style={styles.relationArrow}>→</Text>
            <AgentAvatar alias={edge.toName} size={24} />
            <View style={styles.rowMain}>
              <Text style={styles.conflictItemTitle}>{edge.fromName} → {edge.toName}</Text>
              <Text style={styles.help}>{edge.label} · 强度 {edge.strength} · 委托 {edge.delegations} / 完成 {edge.completions} / 引用 {edge.mentions}</Text>
            </View>
          </View>
        </View>
      )) : <Text style={styles.help}>几轮委托、接力或互相引用后，这里会显示当前房间里的 Agent 关系变化。</Text>}
    </View>
  );
}
