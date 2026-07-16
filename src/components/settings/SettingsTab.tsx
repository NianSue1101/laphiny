import type { ComponentType, Dispatch, SetStateAction } from 'react';
import {
  ScrollView,
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextProps,
} from 'react-native';

import {
  formatDateTime,
  getDiagnosticCategoryLabel,
  getDiagnosticLevelLabel,
  getDiagnosticLogIcon,
  getServiceWorkerStatusLabel,
} from '../../app/app_utils';
import { getDiagnosticLevelStyle } from '../../app/app_styles';
import type { ServiceWorkerStatus, StorageBackendInfo } from '../../app/app_types';
import type {
  AppPreferences,
  DiagnosticLogEntry,
  FeedbackConfig,
  FeedbackLogEntry,
  SyncConfig,
} from '../../types';
import type { SyncConflictReport } from '../../lib/sync_conflicts';
import { HealthMetric, PrimaryButton, SecondaryButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';
import {
  PersonalizationSettingsPanel,
  ProjectInfoSettingsPanel,
  SyncBackendSettingsPanel,
} from './SettingsInfoPanels';
import { SyncConflictReportPanel } from './SyncConflictReportPanel';

type Styles = Record<string, any>;

interface StorageSummary {
  messageCount: number;
  messageBytes: number;
  messageSizeLabel: string;
}

interface DiagnosticSummary {
  total: number;
  errors: number;
  warnings: number;
  recent: DiagnosticLogEntry[];
}

type PreferencesPatch = Partial<Omit<AppPreferences, 'updatedAt'>>;

interface SettingsTabProps {
  appVersion: string;
  layoutMode: string;
  width: number;
  networkOnline: boolean;
  connectionsCount: number;
  roomsCount: number;
  storageSummary: StorageSummary;
  appPreferences: AppPreferences;
  fontsLoaded: boolean;
  syncConfig: SyncConfig;
  syncing: boolean;
  checkingSyncConflicts: boolean;
  syncConflictReport: SyncConflictReport | null;
  backupPaste: string;
  feedbackConfig: FeedbackConfig;
  feedbackBusy: boolean;
  feedbackLogs: FeedbackLogEntry[];
  diagnosticLogs: DiagnosticLogEntry[];
  diagnosticLogsOpen: boolean;
  diagnosticSummary: DiagnosticSummary;
  storageBackend: StorageBackendInfo | null;
  serviceWorkerStatus: ServiceWorkerStatus;
  pwaInstalled: boolean;
  defaultFeedbackBaseUrl: string;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  updateAppPreferences: (patch: PreferencesPatch) => void;
  setSyncConfig: Dispatch<SetStateAction<SyncConfig>>;
  testSyncBackend: () => void;
  checkSyncConflicts: () => void;
  pullSyncSnapshot: () => void;
  pushSyncSnapshot: () => void;
  exportAppBackup: () => void;
  importBackupFile: () => void;
  handlePasteBackup: () => void;
  setBackupPaste: (value: string) => void;
  setFeedbackConfig: Dispatch<SetStateAction<FeedbackConfig>>;
  uploadFeedbackLogs: () => void;
  setDiagnosticLogsOpen: Dispatch<SetStateAction<boolean>>;
  exportDiagnosticBundle: () => void;
  clearDiagnosticLogs: () => void;
}

export function SettingsTab({
  appVersion,
  layoutMode,
  width,
  networkOnline,
  connectionsCount,
  roomsCount,
  storageSummary,
  appPreferences,
  fontsLoaded,
  syncConfig,
  syncing,
  checkingSyncConflicts,
  syncConflictReport,
  backupPaste,
  feedbackConfig,
  feedbackBusy,
  feedbackLogs,
  diagnosticLogs,
  diagnosticLogsOpen,
  diagnosticSummary,
  storageBackend,
  serviceWorkerStatus,
  pwaInstalled,
  defaultFeedbackBaseUrl,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  updateAppPreferences,
  setSyncConfig,
  testSyncBackend,
  checkSyncConflicts,
  pullSyncSnapshot,
  pushSyncSnapshot,
  exportAppBackup,
  importBackupFile,
  handlePasteBackup,
  setBackupPaste,
  setFeedbackConfig,
  uploadFeedbackLogs,
  setDiagnosticLogsOpen,
  exportDiagnosticBundle,
  clearDiagnosticLogs,
}: SettingsTabProps) {
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
      <View style={styles.squareHeader}>
        <View>
          <Text style={styles.sectionTitle}>设置</Text>
          <Text style={styles.help}>管理同步、备份、诊断日志和项目运行信息。</Text>
        </View>
        <Text style={styles.squareCount}>v{appVersion}</Text>
      </View>

      <ProjectInfoSettingsPanel
        appVersion={appVersion}
        layoutMode={layoutMode}
        width={width}
        networkOnline={networkOnline}
        connectionsCount={connectionsCount}
        roomsCount={roomsCount}
        storageSummary={storageSummary}
        styles={styles}
        TextComponent={Text}
      />

      <PersonalizationSettingsPanel
        appPreferences={appPreferences}
        fontsLoaded={fontsLoaded}
        styles={styles}
        TextComponent={Text}
        updateAppPreferences={updateAppPreferences}
      />

      <SyncBackendSettingsPanel
        syncConfig={syncConfig}
        syncing={syncing}
        checkingSyncConflicts={checkingSyncConflicts}
        syncConflictReport={(
          <SyncConflictReportPanel
            report={syncConflictReport}
            styles={styles}
            TextComponent={Text}
          />
        )}
        styles={styles}
        TextComponent={Text}
        TextInputComponent={TextInput}
        setSyncConfig={setSyncConfig}
        testSyncBackend={testSyncBackend}
        checkSyncConflicts={checkSyncConflicts}
        pullSyncSnapshot={pullSyncSnapshot}
        pushSyncSnapshot={pushSyncSnapshot}
      />

      <View style={styles.syncPanel}>
        <View style={styles.syncHeader}>
          <View style={styles.syncHeaderText}>
            <Text style={styles.cardTitle}>数据、备份与日志</Text>
            <Text style={styles.help}>
              把本地备份、脱敏反馈、诊断日志和存储状态放在一起，避免在设置页里来回寻找。
            </Text>
          </View>
          <Text style={styles.squareCount}>v5</Text>
        </View>

        <View style={styles.settingsSubsection}>
          <Text style={styles.panelLabel}>本地备份 / 恢复</Text>
          <Text style={styles.help}>
            完整备份可能包含 API Key，请只保存在可信位置；恢复时会合并当前数据。
          </Text>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="download-outline" label="导出备份文件" onPress={exportAppBackup} />
            <SecondaryButton icon="cloud-upload-outline" label="上传备份文件" onPress={importBackupFile} />
            <SecondaryButton
              icon="clipboard-outline"
              label="粘贴恢复"
              onPress={handlePasteBackup}
              disabled={!backupPaste.trim()}
            />
          </View>
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={backupPaste}
            onChangeText={setBackupPaste}
            placeholder="粘贴 Laphiny 完整备份 JSON，恢复时会合并当前数据。"
            autoCapitalize="none"
            textAlignVertical="top"
          />
        </View>

        <View style={styles.settingsDivider} />

        <View style={styles.settingsSubsection}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.panelLabel}>反馈日志</Text>
              <Text style={styles.help}>
                默认使用服务器反馈后端，只允许从本机上传脱敏日志；不会从服务器拉取历史日志。
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.syncToggle, feedbackConfig.enabled && styles.syncToggleOn]}
              onPress={() => setFeedbackConfig((current) => ({
                ...current,
                enabled: !current.enabled,
                updatedAt: new Date().toISOString(),
              }))}
            >
              <Text style={[styles.syncToggleText, feedbackConfig.enabled && styles.syncToggleTextOn]}>
                {feedbackConfig.enabled ? '已启用' : '未启用'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={feedbackConfig.baseUrl}
            onChangeText={(baseUrl) => setFeedbackConfig((current) => ({
              ...current,
              baseUrl,
              updatedAt: new Date().toISOString(),
            }))}
            placeholder={defaultFeedbackBaseUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={feedbackConfig.apiKey}
            onChangeText={(apiKey) => setFeedbackConfig((current) => ({
              ...current,
              apiKey,
              updatedAt: new Date().toISOString(),
            }))}
            placeholder="反馈服务 API Key，可留空"
            autoCapitalize="none"
            secureTextEntry
          />
          <View style={styles.buttonRow}>
            <PrimaryButton
              icon="cloud-upload-outline"
              label={feedbackBusy ? '上传中...' : '上传反馈日志'}
              onPress={uploadFeedbackLogs}
              disabled={feedbackBusy}
            />
          </View>
          {feedbackLogs.length ? (
            <View style={styles.diagnosticList}>
              {feedbackLogs.map((entry) => (
                <View key={entry.id} style={styles.diagnosticItem}>
                  <View style={styles.diagnosticHeader}>
                    <Text style={styles.squareEventTitle}>{entry.source || 'Laphiny App'}</Text>
                    <Text style={styles.squareEventMeta}>{formatDateTime(entry.createdAt)}</Text>
                  </View>
                  <Text style={styles.squareEventMeta}>
                    {entry.platform ?? 'unknown'} · v{entry.appVersion ?? 'unknown'} · {entry.id}
                  </Text>
                  {entry.summary ? <Text style={styles.diagnosticMessage}>{entry.summary}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.settingsDivider} />

        <View style={styles.settingsSubsection}>
          <View style={styles.syncHeader}>
            <View style={styles.syncHeaderText}>
              <Text style={styles.panelLabel}>诊断日志</Text>
              <Text style={styles.help}>
                记录最近的请求、委托、连接测试、同步和备份恢复结果。导出诊断包会脱敏，并保存为 JSON 文件。
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.syncToggle, diagnosticLogsOpen && styles.syncToggleOn]}
              onPress={() => setDiagnosticLogsOpen((open) => !open)}
            >
              <Text style={[styles.syncToggleText, diagnosticLogsOpen && styles.syncToggleTextOn]}>
                {diagnosticLogsOpen ? '收起日志' : '查看日志'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={styles.healthMetricRow}>
            <HealthMetric label="总数" value={diagnosticSummary.total} tone="unknown" />
            <HealthMetric
              label="近 50 错误"
              value={diagnosticSummary.errors}
              tone={diagnosticSummary.errors > 0 ? 'error' : 'ok'}
            />
            <HealthMetric
              label="近 50 警告"
              value={diagnosticSummary.warnings}
              tone={diagnosticSummary.warnings > 0 ? 'checking' : 'ok'}
            />
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="download-outline" label="导出诊断 JSON" onPress={exportDiagnosticBundle} />
            <SecondaryButton
              icon="trash-outline"
              label="清空日志"
              onPress={clearDiagnosticLogs}
              disabled={diagnosticLogs.length === 0}
            />
          </View>
          {diagnosticLogsOpen ? (
            <View style={styles.diagnosticList}>
              {diagnosticSummary.recent.length === 0 ? (
                <Text style={styles.help}>还没有诊断日志。发送消息、测试连接或同步后会自动记录。</Text>
              ) : null}
              {[...diagnosticSummary.recent].reverse().map((log) => (
                <View key={log.id} style={styles.diagnosticItem}>
                  <View style={styles.diagnosticHeader}>
                    <View style={styles.squareEventSource}>
                      <Ionicons name={getDiagnosticLogIcon(log)} size={16} color="#2563eb" />
                      <Text style={styles.squareEventTitle}>{log.title}</Text>
                    </View>
                    <Text style={[styles.diagnosticLevel, getDiagnosticLevelStyle(log.level)]}>
                      {getDiagnosticLevelLabel(log.level)}
                    </Text>
                  </View>
                  <Text style={styles.squareEventMeta}>
                    {formatDateTime(log.createdAt)} · {getDiagnosticCategoryLabel(log.category)}
                    {log.connectionName ? ` · ${log.connectionName}` : ''}
                    {log.roomName ? ` · ${log.roomName}` : ''}
                    {log.durationMs != null ? ` · ${log.durationMs}ms` : ''}
                    {log.requestId ? ` · ${log.requestId}` : ''}
                  </Text>
                  {log.message ? <Text style={styles.diagnosticMessage}>{log.message}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.settingsDivider} />

        <View style={styles.storageInfoBox}>
          <Text style={styles.storageInfoTitle}>存储与隐私状态</Text>
          <Text style={styles.storageInfoText}>
            密钥：{storageBackend?.secretBackend ?? '加载中'} · 长期记录：{storageBackend?.durableBackend ?? '加载中'} · SW{' '}
            {getServiceWorkerStatusLabel(serviceWorkerStatus)}
            {pwaInstalled ? ' · 已安装 PWA' : ''}
          </Text>
          <Text style={styles.storageInfoText}>
            默认本地保存；同步、反馈和完整备份都需要用户显式操作或启用。
          </Text>
          {storageBackend?.durableDirectory ? (
            <Text style={styles.storageInfoPath}>{storageBackend.durableDirectory}</Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}
