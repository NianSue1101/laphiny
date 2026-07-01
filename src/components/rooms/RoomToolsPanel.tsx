import type { ComponentType, ReactNode } from 'react';
import {
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import { formatDateTime } from '../../app/app_utils';
import { formatRoomMemoryForPrompt, summarizeRoomMemory } from '../../lib/room_memory';
import { summarizeRoleplayConfig } from '../../lib/roleplay';
import type {
  ChatMessage,
  HermesConnection,
  RoleplayConfig,
  Room,
  RoomMember,
  TeamTemplate,
} from '../../types';
import { MarkdownText } from '../MarkdownText';
import { MiniButton } from '../Primitives';

type Styles = Record<string, any>;

interface RoomToolsPanelProps {
  room: Room;
  messages: ChatMessage[];
  contextLimitFallback: number;
  maxDelegationDepthFallback: number;
  selectedFontFamily?: string;
  teamTemplateName: string;
  selectedRoomTeamTemplates: TeamTemplate[];
  availableConnectionsForRoom: HermesConnection[];
  summaryGenerating: boolean;
  memoryGenerating: boolean;
  roleplayArchivePanel: ReactNode;
  taskBoardPanel: ReactNode;
  roomGrowthPanel: ReactNode;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  onOpenRoomManagement: (roomId: string) => void;
  onSetDefaultCollaborationMode: (mode: 'manual' | 'parallel' | 'sequential') => void;
  onToggleRoomAutoDelegation: () => void;
  onUpdateRoomDelegationDepth: (delta: number) => void;
  onToggleRoomRoleplay: () => void;
  onUpdateRoomRoleplay: (patch: Partial<RoleplayConfig>) => void;
  onUpdateRoomMember: (connectionId: string, patch: Partial<RoomMember>) => void;
  onRemoveRoomMember: (member: RoomMember) => void;
  onAddRoomMember: (connection: HermesConnection) => void;
  onChangeTeamTemplateName: (name: string) => void;
  onSaveTeamTemplate: () => void;
  onApplyTeamTemplate: (template: TeamTemplate) => void;
  onSetSummaryConnection: (connectionId: string) => void;
  onGenerateSummary: () => void;
  onConfirmPendingMemory: () => void;
  onDiscardPendingMemory: () => void;
  onGenerateMemory: () => void;
  onClearMemory: () => void;
  onExportRoom: (format: 'json' | 'markdown') => void;
  onResetSession: () => void;
  onClearMessages: () => void;
  onDeleteRoom: () => void;
}

export function RoomToolsPanel({
  room,
  messages,
  contextLimitFallback,
  maxDelegationDepthFallback,
  selectedFontFamily,
  teamTemplateName,
  selectedRoomTeamTemplates,
  availableConnectionsForRoom,
  summaryGenerating,
  memoryGenerating,
  roleplayArchivePanel,
  taskBoardPanel,
  roomGrowthPanel,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  onOpenRoomManagement,
  onSetDefaultCollaborationMode,
  onToggleRoomAutoDelegation,
  onUpdateRoomDelegationDepth,
  onToggleRoomRoleplay,
  onUpdateRoomRoleplay,
  onUpdateRoomMember,
  onRemoveRoomMember,
  onAddRoomMember,
  onChangeTeamTemplateName,
  onSaveTeamTemplate,
  onApplyTeamTemplate,
  onSetSummaryConnection,
  onGenerateSummary,
  onConfirmPendingMemory,
  onDiscardPendingMemory,
  onGenerateMemory,
  onClearMemory,
  onExportRoom,
  onResetSession,
  onClearMessages,
  onDeleteRoom,
}: RoomToolsPanelProps) {
  const attachmentsCount = messages.reduce(
    (total, message) => total + (message.attachments?.length ?? 0),
    0,
  );
  const enabledMembers = room.members.filter((member) => member.enabled);

  return (
    <View style={styles.toolsPanel}>
      <View style={styles.toolMetricRow}>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{messages.length}</Text>
          <Text style={styles.toolMetricLabel}>消息</Text>
        </View>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{attachmentsCount}</Text>
          <Text style={styles.toolMetricLabel}>附件</Text>
        </View>
        <View style={styles.toolMetric}>
          <Text style={styles.toolMetricValue}>{room.contextLimit ?? contextLimitFallback}</Text>
          <Text style={styles.toolMetricLabel}>上下文</Text>
        </View>
      </View>

      <View style={styles.roomEditPanel}>
        <Text style={styles.panelLabel}>聊天内工具</Text>
        <Text style={styles.help}>
          聊天页只保留协作、记忆和导出等工具；房间名称、成员、模式、上下文等基础设置请在房间页统一管理，避免两套入口状态错乱。
        </Text>
        <View style={styles.toolActions}>
          <MiniButton
            icon="options-outline"
            label="打开房间管理"
            onPress={() => onOpenRoomManagement(room.id)}
          />
        </View>
      </View>

      {room.kind === 'group' ? (
        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>Soul 协作策略</Text>
          <View style={styles.toolActions}>
            <MiniButton
              icon="hand-left-outline"
              label={room.defaultCollaborationMode === 'manual' || !room.defaultCollaborationMode ? '默认：手动' : '切手动'}
              onPress={() => onSetDefaultCollaborationMode('manual')}
            />
            <MiniButton
              icon="git-network-outline"
              label={room.defaultCollaborationMode === 'parallel' ? '默认：并行' : '切并行'}
              onPress={() => onSetDefaultCollaborationMode('parallel')}
            />
            <MiniButton
              icon="git-branch-outline"
              label={room.defaultCollaborationMode === 'sequential' ? '默认：接力' : '切接力'}
              onPress={() => onSetDefaultCollaborationMode('sequential')}
            />
            <MiniButton
              icon={room.autoDelegationEnabled === false ? 'flash-off-outline' : 'flash-outline'}
              label={room.autoDelegationEnabled === false ? '自动委托关' : '自动委托开'}
              onPress={onToggleRoomAutoDelegation}
            />
          </View>
          <View style={styles.stepper}>
            <MiniButton icon="remove-outline" label="深度 -1" onPress={() => onUpdateRoomDelegationDepth(-1)} />
            <Text style={styles.help}>最大委托深度：{room.maxDelegationDepth ?? maxDelegationDepthFallback}</Text>
            <MiniButton icon="add-outline" label="深度 +1" onPress={() => onUpdateRoomDelegationDepth(1)} />
          </View>
          <Text style={styles.help}>
            默认模式会在群聊无 @ 时自动决定是否叫全员；手动模式保持“无 @ 不回复”。
          </Text>
        </View>
      ) : null}

      {room.kind === 'group' ? (
        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>角色扮演 RP 模式</Text>
          <Text style={styles.help}>
            桌游店式多人 RP：选择一位主 Agent 作为 GM/主持人负责推进剧情，其他 Agent 作为角色、NPC 或氛围补充依次入戏。
          </Text>
          <View style={styles.toolActions}>
            <MiniButton
              icon={room.roleplay?.enabled ? 'game-controller' : 'game-controller-outline'}
              label={room.roleplay?.enabled ? '关闭 RP' : '开启 RP'}
              onPress={onToggleRoomRoleplay}
            />
            <MiniButton
              icon={room.roleplay?.includeAllAgents === false ? 'person-outline' : 'people-outline'}
              label={room.roleplay?.includeAllAgents === false ? '仅 GM' : '全员入戏'}
              onPress={() => onUpdateRoomRoleplay({ includeAllAgents: room.roleplay?.includeAllAgents === false })}
            />
          </View>
          <Text style={styles.help}>状态：{summarizeRoleplayConfig(room.roleplay)}</Text>
          <Text style={styles.help}>
            GM：{room.members.find((member) => member.connectionId === room.roleplay?.gmConnectionId)?.alias ?? enabledMembers[0]?.alias ?? '未选择'}
          </Text>
          <View style={styles.toolActions}>
            {enabledMembers.map((member) => (
              <MiniButton
                key={member.connectionId}
                icon="sparkles-outline"
                label={`GM ${member.alias}`}
                onPress={() => onUpdateRoomRoleplay({ gmConnectionId: member.connectionId })}
              />
            ))}
          </View>
          <TextInput
            style={styles.input}
            value={room.roleplay?.playerName ?? '玩家'}
            onChangeText={(playerName) => onUpdateRoomRoleplay({ playerName })}
            placeholder="玩家称呼，例如：调查员 / 旅人 / 店员"
          />
          <TextInput
            style={styles.input}
            value={room.roleplay?.genre ?? '奇幻冒险'}
            onChangeText={(genre) => onUpdateRoomRoleplay({ genre })}
            placeholder="类型，例如：都市怪谈 / 奇幻冒险 / 科幻悬疑"
          />
          <TextInput
            style={styles.input}
            value={room.roleplay?.tone ?? '沉浸、轻桌游、重角色互动'}
            onChangeText={(tone) => onUpdateRoomRoleplay({ tone })}
            placeholder="基调，例如：温柔治愈 / 黑暗悬疑 / 轻松搞笑"
          />
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={room.roleplay?.premise ?? ''}
            onChangeText={(premise) => onUpdateRoomRoleplay({ premise })}
            placeholder="世界观 / 剧情前提 / 开局设定"
            textAlignVertical="top"
          />
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={room.roleplay?.currentScene ?? ''}
            onChangeText={(currentScene) => onUpdateRoomRoleplay({ currentScene })}
            placeholder="当前场景，可用 /scene 指令或在这里手动维护"
            textAlignVertical="top"
          />
          <Text style={styles.help}>
            输入 /rp 开始或继续故事，/scene 更新场景，/ooc 进行场外规则讨论。RP 开启后，普通输入也会自动进入“GM → 其他 Agent”的接力回合。
          </Text>
        </View>
      ) : null}

      {roleplayArchivePanel}
      {taskBoardPanel}
      {roomGrowthPanel}

      {room.kind === 'group' ? (
        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>群成员</Text>
          {room.members.map((member) => (
            <View key={member.connectionId} style={styles.memberEditorRow}>
              <TouchableOpacity
                style={[styles.syncToggle, member.enabled && styles.syncToggleOn]}
                onPress={() => onUpdateRoomMember(member.connectionId, { enabled: !member.enabled })}
              >
                <Text style={[styles.syncToggleText, member.enabled && styles.syncToggleTextOn]}>
                  {member.enabled ? '启用' : '停用'}
                </Text>
              </TouchableOpacity>
              <TextInput
                style={[styles.input, styles.memberAliasInput]}
                value={member.alias}
                onChangeText={(alias) => onUpdateRoomMember(member.connectionId, { alias })}
                placeholder="成员别名"
              />
              <MiniButton icon="remove-circle-outline" label="移除" onPress={() => onRemoveRoomMember(member)} />
            </View>
          ))}
          {availableConnectionsForRoom.length ? (
            <View style={styles.toolActions}>
              {availableConnectionsForRoom.map((connection) => (
                <MiniButton
                  key={connection.id}
                  icon="add-circle-outline"
                  label={`加入 ${connection.name}`}
                  onPress={() => onAddRoomMember(connection)}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.help}>没有可加入的新连接。</Text>
          )}
        </View>
      ) : null}

      {room.kind === 'group' ? (
        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>团队模板与总结</Text>
          <View style={styles.inlineFormRow}>
            <TextInput
              style={[styles.input, styles.inlineInput]}
              value={teamTemplateName}
              onChangeText={onChangeTeamTemplateName}
              placeholder="模板名称"
            />
            <MiniButton icon="bookmark-outline" label="保存模板" onPress={onSaveTeamTemplate} />
          </View>
          {selectedRoomTeamTemplates.length ? (
            <View style={styles.toolActions}>
              {selectedRoomTeamTemplates.slice(0, 4).map((template) => (
                <MiniButton
                  key={template.id}
                  icon="albums-outline"
                  label={`应用 ${template.name}`}
                  onPress={() => onApplyTeamTemplate(template)}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.help}>还没有匹配当前房间成员的团队模板。</Text>
          )}
          <Text style={styles.help}>
            总结者：{room.members.find((member) => member.connectionId === room.summaryConnectionId)?.alias ?? '自动选择首个启用成员'}
          </Text>
          <View style={styles.toolActions}>
            {enabledMembers.map((member) => (
              <MiniButton
                key={member.connectionId}
                icon="reader-outline"
                label={`总结者 ${member.alias}`}
                onPress={() => onSetSummaryConnection(member.connectionId)}
              />
            ))}
            <MiniButton
              icon="sparkles-outline"
              label={summaryGenerating ? '总结中...' : '生成共识总结'}
              onPress={onGenerateSummary}
            />
          </View>
        </View>
      ) : null}

      {room.kind === 'group' ? (
        <View style={styles.roomEditPanel}>
          <Text style={styles.panelLabel}>房间记忆胶囊</Text>
          {room.pendingMemoryCapsule ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>待确认记忆草案 · v{room.pendingMemoryCapsule.version}</Text>
              <Text style={styles.help}>{summarizeRoomMemory(room.pendingMemoryCapsule)}</Text>
              <MarkdownText content={formatRoomMemoryForPrompt(room.pendingMemoryCapsule)} fontFamily={selectedFontFamily} />
              <View style={styles.toolActions}>
                <MiniButton icon="checkmark-circle-outline" label="确认沉淀" onPress={onConfirmPendingMemory} />
                <MiniButton icon="close-circle-outline" label="丢弃草案" onPress={onDiscardPendingMemory} />
              </View>
            </View>
          ) : null}
          {room.memoryCapsule ? (
            <View style={styles.summaryBox}>
              <Text style={styles.summaryTitle}>
                v{room.memoryCapsule.version} · {room.memoryCapsule.authorName ?? 'Laphiny'} · {formatDateTime(room.memoryCapsule.updatedAt)}
              </Text>
              <Text style={styles.help}>{summarizeRoomMemory(room.memoryCapsule)}</Text>
              <MarkdownText content={formatRoomMemoryForPrompt(room.memoryCapsule)} fontFamily={selectedFontFamily} />
            </View>
          ) : (
            <Text style={styles.help}>
              还没有房间记忆。生成后会把目标、共识、待办、偏好和未解决问题注入后续群聊上下文。
            </Text>
          )}
          <View style={styles.toolActions}>
            <MiniButton
              icon="sparkles-outline"
              label={memoryGenerating ? '生成中...' : room.memoryCapsule ? '更新记忆' : '生成记忆'}
              onPress={onGenerateMemory}
            />
            <MiniButton icon="trash-outline" label="清空记忆胶囊" onPress={onClearMemory} />
          </View>
        </View>
      ) : null}

      <View style={styles.toolActions}>
        <MiniButton icon="download-outline" label="导出 JSON" onPress={() => onExportRoom('json')} />
        <MiniButton icon="document-text-outline" label="导出 MD" onPress={() => onExportRoom('markdown')} />
        <MiniButton icon="refresh-circle-outline" label="清空记忆" onPress={onResetSession} />
        <MiniButton icon="trash-outline" label="清空记录" onPress={onClearMessages} />
        <MiniButton icon="close-circle-outline" label="删除房间" onPress={onDeleteRoom} />
      </View>
    </View>
  );
}
