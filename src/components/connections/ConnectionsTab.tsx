import { useState, type ComponentType, type Dispatch, type SetStateAction } from 'react';
import { ScrollView, View, type TextInputProps, type TextProps } from 'react-native';

import type { ConnectionFormState, ConnectionHealth } from '../../app/app_types';
import type { HermesConnection } from '../../types';
import {
  AgentAvatar,
  ConnectionHealthDetails,
  ConnectionProfileCard,
  DisclosureSection,
  HealthBadge,
  HealthMetric,
  MiniButton,
  PrimaryButton,
  SecondaryButton,
} from '../Primitives';

type Styles = Record<string, any>;

interface ConnectionsTabProps {
  connections: HermesConnection[];
  connectionForm: ConnectionFormState;
  connectionEditForm: ConnectionFormState;
  editingConnectionId: string | null;
  jsonPaste: string;
  healthSummary: {
    ok: number;
    error: number;
    checking: number;
    unknown: number;
  };
  connectionHealth: Record<string, ConnectionHealth>;
  testingConnectionId: string | null;
  profilingConnectionId: string | null;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  setConnectionForm: Dispatch<SetStateAction<ConnectionFormState>>;
  setConnectionEditForm: Dispatch<SetStateAction<ConnectionFormState>>;
  setJsonPaste: (value: string) => void;
  addConnection: () => void;
  importConnections: () => void;
  handlePasteImport: () => void;
  refreshConnectionHealth: (all?: boolean) => void;
  toggleConnection: (connectionId: string) => void;
  beginEditConnection: (connection: HermesConnection) => void;
  cancelEditConnection: () => void;
  saveConnectionEdit: (connection: HermesConnection) => void;
  chooseConnectionAvatar: (connection: HermesConnection) => void;
  clearConnectionAvatar: (connection: HermesConnection) => void;
  testConnection: (connection: HermesConnection) => void;
  refreshAgentProfile: (connection: HermesConnection) => void;
  createDirectRoom: (connection: HermesConnection) => void;
  deleteConnection: (connection: HermesConnection) => void;
}

export function ConnectionsTab({
  connections,
  connectionForm,
  connectionEditForm,
  editingConnectionId,
  jsonPaste,
  healthSummary,
  connectionHealth,
  testingConnectionId,
  profilingConnectionId,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  setConnectionForm,
  setConnectionEditForm,
  setJsonPaste,
  addConnection,
  importConnections,
  handlePasteImport,
  refreshConnectionHealth,
  toggleConnection,
  beginEditConnection,
  cancelEditConnection,
  saveConnectionEdit,
  chooseConnectionAvatar,
  clearConnectionAvatar,
  testConnection,
  refreshAgentProfile,
  createDirectRoom,
  deleteConnection,
}: ConnectionsTabProps) {
  const [setupPanel, setSetupPanel] = useState<'add' | 'import' | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [expandedConnectionId, setExpandedConnectionId] = useState<string | null>(null);

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
      <Text style={styles.sectionTitle}>Hermes 连接</Text>
      <Text style={styles.help}>日常只看连接状态并快速进入单聊；新增、导入和维护操作按需展开。</Text>
      <View style={styles.buttonRow}>
        <PrimaryButton
          icon={setupPanel === 'add' ? 'chevron-up-outline' : 'add-circle-outline'}
          label={setupPanel === 'add' ? '收起添加' : '添加连接'}
          onPress={() => setSetupPanel((current) => current === 'add' ? null : 'add')}
        />
        <SecondaryButton
          icon={setupPanel === 'import' ? 'chevron-up-outline' : 'cloud-upload-outline'}
          label={setupPanel === 'import' ? '收起导入' : '导入连接'}
          onPress={() => setSetupPanel((current) => current === 'import' ? null : 'import')}
        />
      </View>

      {setupPanel === 'add' ? <View style={styles.roomEditPanel}>
        <Text style={styles.panelLabel}>添加 Hermes Gateway</Text>
        <TextInput
          style={styles.input}
          value={connectionForm.name}
          onChangeText={(name) => setConnectionForm((current) => ({ ...current, name }))}
          placeholder="名称，例如 Flor"
        />
        <TextInput
          style={styles.input}
          value={connectionForm.baseUrl}
          onChangeText={(baseUrl) => setConnectionForm((current) => ({ ...current, baseUrl }))}
          placeholder="http://127.0.0.1:8642"
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextInput
          style={styles.input}
          value={connectionForm.apiKey}
          onChangeText={(apiKey) => setConnectionForm((current) => ({ ...current, apiKey }))}
          placeholder="API Key，可留空"
          autoCapitalize="none"
          secureTextEntry
        />
        <TextInput
          style={styles.input}
          value={connectionForm.model}
          onChangeText={(model) => setConnectionForm((current) => ({ ...current, model }))}
          placeholder="模型名"
          autoCapitalize="none"
        />
        <PrimaryButton icon="add-circle-outline" label="确认添加" onPress={addConnection} />
      </View> : null}

      {setupPanel === 'import' ? <View style={[styles.importSection, styles.roomEditPanel]}>
        <Text style={styles.panelLabel}>导入连接</Text>
        <View style={styles.importRow}>
          <SecondaryButton icon="cloud-upload-outline" label="导入 JSON" onPress={importConnections} />
          <SecondaryButton
            icon="clipboard-outline"
            label="粘贴导入"
            onPress={handlePasteImport}
            disabled={!jsonPaste.trim()}
          />
        </View>
        <TextInput
          style={[styles.input, styles.jsonPasteInput]}
          multiline
          value={jsonPaste}
          onChangeText={setJsonPaste}
          placeholder={`[
  {
    "name": "My Hermes",
    "baseUrl": "http://...",
    "apiKey": "...",
    "profile": { "publicPersona": "公开人格摘要", "strengths": ["擅长领域"] }
  }
]`}
          autoCapitalize="none"
          textAlignVertical="top"
        />
      </View> : null}

      <Text style={styles.sectionTitle}>连接列表</Text>
      <DisclosureSection
        icon="pulse-outline"
        title="连接健康"
        summary={`${healthSummary.ok} 可用 · ${healthSummary.error} 异常 · ${healthSummary.checking} 检查中 · ${healthSummary.unknown} 未知`}
        open={healthOpen}
        onToggle={() => setHealthOpen((open) => !open)}
      >
        <View style={styles.healthPanelHeader}>
          <Text style={styles.help}>延迟、模型列表和最近错误会记录在这里。</Text>
          <SecondaryButton
            icon="pulse-outline"
            label={healthSummary.checking > 0 ? '检查中...' : '刷新全部'}
            onPress={() => refreshConnectionHealth(true)}
            disabled={healthSummary.checking > 0}
          />
        </View>
        <View style={styles.healthMetricRow}>
          <HealthMetric label="可用" value={healthSummary.ok} tone="ok" />
          <HealthMetric label="失败" value={healthSummary.error} tone="error" />
          <HealthMetric label="检查中" value={healthSummary.checking} tone="checking" />
          <HealthMetric label="未知" value={healthSummary.unknown} tone="unknown" />
        </View>
      </DisclosureSection>
      {connections.length === 0 ? <Text style={styles.muted}>暂无连接。</Text> : null}
      {connections.map((connection) => {
        const editing = editingConnectionId === connection.id;
        const expanded = expandedConnectionId === connection.id;
        return (
          <View key={connection.id} style={styles.card}>
            {editing ? (
              <View style={styles.editPanel}>
                <Text style={styles.cardTitle}>编辑连接</Text>
                <TextInput
                  style={styles.input}
                  value={connectionEditForm.name}
                  onChangeText={(name) => setConnectionEditForm((current) => ({ ...current, name }))}
                  placeholder="连接名称"
                />
                <TextInput
                  style={styles.input}
                  value={connectionEditForm.baseUrl}
                  onChangeText={(baseUrl) => setConnectionEditForm((current) => ({ ...current, baseUrl }))}
                  placeholder="Hermes API 地址"
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <TextInput
                  style={styles.input}
                  value={connectionEditForm.apiKey}
                  onChangeText={(apiKey) => setConnectionEditForm((current) => ({ ...current, apiKey }))}
                  placeholder="API Key，可留空"
                  autoCapitalize="none"
                  secureTextEntry
                />
                <TextInput
                  style={styles.input}
                  value={connectionEditForm.model}
                  onChangeText={(model) => setConnectionEditForm((current) => ({ ...current, model }))}
                  placeholder="模型名"
                  autoCapitalize="none"
                />
                <View style={styles.buttonRow}>
                  <PrimaryButton icon="save-outline" label="保存" onPress={() => saveConnectionEdit(connection)} />
                  <SecondaryButton icon="close-outline" label="取消" onPress={cancelEditConnection} />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.connectionHeader}>
                  <AgentAvatar alias={connection.name} size={42} imageUri={connection.avatarUri} />
                  <View style={styles.rowMain}>
                    <Text style={styles.cardTitle}>{connection.name}</Text>
                    <Text style={styles.muted}>{connection.baseUrl}</Text>
                    <Text style={styles.help}>模型：{connection.model}</Text>
                  </View>
                  <View style={styles.connectionBadges}>
                    <Text style={[styles.badge, connection.enabled ? styles.badgeOn : styles.badgeOff]}>
                      {connection.enabled ? '启用' : '停用'}
                    </Text>
                    <HealthBadge health={connectionHealth[connection.id]} />
                  </View>
                </View>
                <ConnectionHealthDetails health={connectionHealth[connection.id]} />
                <View style={styles.buttonRow}>
                  <PrimaryButton
                    icon={connection.enabled ? 'chatbubble-outline' : 'play-circle-outline'}
                    label={connection.enabled ? '单聊' : '启用连接'}
                    onPress={() => connection.enabled ? createDirectRoom(connection) : toggleConnection(connection.id)}
                  />
                  <SecondaryButton
                    icon={expanded ? 'chevron-up-outline' : 'ellipsis-horizontal'}
                    label={expanded ? '收起管理' : '管理'}
                    onPress={() => setExpandedConnectionId((current) => current === connection.id ? null : connection.id)}
                  />
                </View>
                {expanded ? <View style={styles.connectionManagement}>
                  <ConnectionProfileCard profile={connection.profile} />
                  <View style={styles.buttonRow}>
                    {connection.enabled ? <SecondaryButton
                      icon="pause-circle-outline"
                      label="停用"
                      onPress={() => toggleConnection(connection.id)}
                    /> : null}
                    <SecondaryButton icon="create-outline" label="编辑" onPress={() => beginEditConnection(connection)} />
                    <SecondaryButton icon="image-outline" label="换头像" onPress={() => chooseConnectionAvatar(connection)} />
                    {connection.avatarUri ? (
                    <SecondaryButton
                      icon="close-circle-outline"
                      label="清除头像"
                      onPress={() => clearConnectionAvatar(connection)}
                    />
                    ) : null}
                    <SecondaryButton
                      icon="pulse-outline"
                      label={testingConnectionId === connection.id ? '测试中...' : '测试'}
                      onPress={() => testConnection(connection)}
                      disabled={testingConnectionId === connection.id}
                    />
                    <SecondaryButton
                      icon="sparkles-outline"
                      label={profilingConnectionId === connection.id ? '生成中...' : connection.profile ? '更新协作卡片' : '生成协作卡片'}
                      onPress={() => refreshAgentProfile(connection)}
                      disabled={profilingConnectionId === connection.id}
                    />
                  </View>
                  <View style={styles.toolActions}>
                    <MiniButton icon="trash-outline" label="删除连接" tone="danger" onPress={() => deleteConnection(connection)} />
                  </View>
                </View> : null}
              </>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}
