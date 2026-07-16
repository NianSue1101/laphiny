import type { ComponentType, ReactNode } from "react";
import {
  Platform,
  TouchableOpacity,
  View,
  type TextInputProps,
  type TextProps,
} from "react-native";

import type { AppPreferences, SyncConfig } from "../../types";
import { formatDateTime, getLayoutModeLabel } from "../../app/app_utils";
import {
  MiniButton,
  PrimaryButton,
  SecondaryButton,
  StatusToken,
} from "../Primitives";
import { Ionicons } from "../SafeIcon";

type Styles = Record<string, any>;

type StorageSummary = {
  messageCount: number;
  messageSizeLabel: string;
};

type PreferencesPatch = Partial<Omit<AppPreferences, "updatedAt">>;

interface ProjectInfoSettingsPanelProps {
  appVersion: string;
  layoutMode: string;
  width: number;
  networkOnline: boolean;
  connectionsCount: number;
  roomsCount: number;
  storageSummary: StorageSummary;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
}

interface PersonalizationSettingsPanelProps {
  appPreferences: AppPreferences;
  fontsLoaded: boolean;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  updateAppPreferences: (patch: PreferencesPatch) => void;
}

export function ProjectInfoSettingsPanel({
  appVersion,
  layoutMode,
  width,
  networkOnline,
  connectionsCount,
  roomsCount,
  storageSummary,
  styles,
  TextComponent: Text,
}: ProjectInfoSettingsPanelProps) {
  return (
    <View style={styles.syncPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.cardTitle}>项目信息</Text>
          <Text style={styles.help}>
            Laphiny 是面向多 Hermes Agent 的本地优先协作聊天客户端。
          </Text>
        </View>
        <StatusToken
          icon="shield-checkmark-outline"
          label="本地优先"
          tone="memory"
        />
      </View>
      <View style={styles.storageInfoBox}>
        <Text style={styles.storageInfoText}>
          应用版本：{appVersion} · Expo SDK 54 · React Native 0.81
        </Text>
        <Text style={styles.storageInfoText}>
          平台：{Platform.OS} · 布局 {getLayoutModeLabel(layoutMode)} /{" "}
          {Math.round(width)}px · {networkOnline ? "在线" : "离线"}
        </Text>
        <Text style={styles.storageInfoText}>
          Android 包名：site.nianxxz.laphiny · EAS
          项目：2970a5e0-248d-49eb-a8b5-90c8c19ed6ee
        </Text>
        <Text style={styles.storageInfoText}>
          关于我：NianSue1101 / PigeonSkeleton，GitHub 公开资料创建于
          2019-05-01，当前公开仓库 6 个。Laphiny 也延续了这种“自然语言编程 +
          私人 AI 小队”的创作方向。
        </Text>
        <Text style={styles.storageInfoText}>
          连接 {connectionsCount} 个 · 房间 {roomsCount} 个 · 消息{" "}
          {storageSummary.messageCount} 条 / {storageSummary.messageSizeLabel}
        </Text>
      </View>
    </View>
  );
}

export function PersonalizationSettingsPanel({
  appPreferences,
  fontsLoaded,
  styles,
  TextComponent: Text,
  updateAppPreferences,
}: PersonalizationSettingsPanelProps) {
  return (
    <View style={styles.syncPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.cardTitle}>外观与功能开关</Text>
          <Text style={styles.help}>
            可切换功能集中保存在当前设备。日期和 reasoning 只影响展示，不会改写消息内容。
          </Text>
        </View>
      </View>
      <View style={styles.settingsToggleGroup}>
        <SettingsToggleRow
          icon="moon-outline"
          label="夜间模式"
          description="切换应用整体明暗配色"
          enabled={appPreferences.themeMode === "dark"}
          onPress={() => updateAppPreferences({ themeMode: appPreferences.themeMode === "dark" ? "light" : "dark" })}
          styles={styles}
          TextComponent={Text}
        />
        <SettingsToggleRow
          icon="calendar-outline"
          label="消息日期"
          description="时间戳同时显示月、日和时刻"
          enabled={Boolean(appPreferences.showMessageDate)}
          onPress={() => updateAppPreferences({ showMessageDate: !appPreferences.showMessageDate })}
          styles={styles}
          TextComponent={Text}
        />
        <SettingsToggleRow
          icon="analytics-outline"
          label="服务端 reasoning"
          description="只展示 Gateway 明确返回的 reasoning/thinking，不推断隐藏思维"
          enabled={Boolean(appPreferences.showReasoning)}
          onPress={() => updateAppPreferences({ showReasoning: !appPreferences.showReasoning })}
          styles={styles}
          TextComponent={Text}
        />
      </View>
      {appPreferences.alwaysApprovedPermissionKeys?.length ? (
        <View style={styles.storageInfoBox}>
          <Text style={styles.storageInfoTitle}>已记住的 Agent 权限</Text>
          <Text style={styles.storageInfoText}>
            当前按 Agent 隔离保存 {appPreferences.alwaysApprovedPermissionKeys.length} 项“总是同意”。清除后，下次执行会重新询问。
          </Text>
          <View style={styles.toolActions}>
            <MiniButton
              icon="refresh-outline"
              label="清除已记住权限"
              onPress={() => updateAppPreferences({ alwaysApprovedPermissionKeys: [] })}
            />
          </View>
        </View>
      ) : null}
      <Text style={styles.panelLabel}>字体</Text>
      <View style={styles.segmentedRow}>
        <TouchableOpacity
          style={[
            styles.segmentedOption,
            appPreferences.fontFamily === "system" &&
              styles.segmentedOptionActive,
          ]}
          onPress={() => updateAppPreferences({ fontFamily: "system" })}
        >
          <Ionicons
            name="phone-portrait-outline"
            size={15}
            color={
              appPreferences.fontFamily === "system" ? "#ffffff" : "#4b5563"
            }
          />
          <Text
            style={[
              styles.segmentedOptionText,
              appPreferences.fontFamily === "system" &&
                styles.segmentedOptionTextActive,
            ]}
          >
            系统默认
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentedOption,
            appPreferences.fontFamily === "lxgw-wenkai" &&
              styles.segmentedOptionActive,
          ]}
          onPress={() => updateAppPreferences({ fontFamily: "lxgw-wenkai" })}
        >
          <Ionicons
            name="text-outline"
            size={15}
            color={
              appPreferences.fontFamily === "lxgw-wenkai"
                ? "#ffffff"
                : "#4b5563"
            }
          />
          <Text
            style={[
              styles.segmentedOptionText,
              appPreferences.fontFamily === "lxgw-wenkai" &&
                styles.segmentedOptionTextActive,
            ]}
          >
            LXGW WenKai
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.help}>
        {appPreferences.fontFamily === "lxgw-wenkai" && !fontsLoaded
          ? "字体正在加载，加载完成后会自动应用。"
          : "后续可以继续扩展更多字体。"}
      </Text>
      <View style={styles.storageInfoBox}>
        <Text style={styles.storageInfoTitle}>下载目录</Text>
        <Text style={styles.storageInfoText}>
          {Platform.OS === "android"
            ? appPreferences.downloadDirectoryUri
              ? `当前使用：${appPreferences.downloadDirectoryLabel ?? "已选择下载目录"}`
              : "首次下载附件/备份/诊断 JSON 时会选择目录，之后自动复用。"
            : Platform.OS === "web"
              ? "Web 端遵循浏览器默认下载目录；原生端会复用首次选择的目录。"
              : "当前平台会优先保存到应用目录。"}
        </Text>
        {appPreferences.downloadDirectoryUri ? (
          <View style={styles.toolActions}>
            <MiniButton
              icon="refresh-outline"
              label="下次重新选择"
              onPress={() =>
                updateAppPreferences({
                  downloadDirectoryUri: undefined,
                  downloadDirectoryLabel: undefined,
                })
              }
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SettingsToggleRow({
  icon,
  label,
  description,
  enabled,
  onPress,
  styles,
  TextComponent: Text,
}: {
  icon: any;
  label: string;
  description: string;
  enabled: boolean;
  onPress: () => void;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
}) {
  return (
    <TouchableOpacity style={styles.settingsToggleRow} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: enabled }}>
      <View style={styles.settingsToggleInfo}>
        <Ionicons name={icon} size={18} color={enabled ? "#2563eb" : "#6b7280"} />
        <View style={styles.settingsToggleCopy}>
          <Text style={styles.storageInfoTitle}>{label}</Text>
          <Text style={styles.storageInfoText}>{description}</Text>
        </View>
      </View>
      <View style={[styles.compactSwitch, enabled && styles.compactSwitchOn]}>
        <View style={[styles.compactSwitchThumb, enabled && styles.compactSwitchThumbOn]} />
      </View>
    </TouchableOpacity>
  );
}

interface SyncBackendSettingsPanelProps {
  syncConfig: SyncConfig;
  syncing: boolean;
  checkingSyncConflicts: boolean;
  syncConflictReport: ReactNode;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  setSyncConfig: (updater: (current: SyncConfig) => SyncConfig) => void;
  testSyncBackend: () => void;
  checkSyncConflicts: () => void;
  pullSyncSnapshot: () => void;
  pushSyncSnapshot: () => void;
}

export function SyncBackendSettingsPanel({
  syncConfig,
  syncing,
  checkingSyncConflicts,
  syncConflictReport,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  setSyncConfig,
  testSyncBackend,
  checkSyncConflicts,
  pullSyncSnapshot,
  pushSyncSnapshot,
}: SyncBackendSettingsPanelProps) {
  return (
    <View style={styles.syncPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.cardTitle}>SQLite 同步后端</Text>
          <Text style={styles.help}>
            连接自己的轻后端后，可在多设备间共享房间、消息和灵庭事件。
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.syncToggle, syncConfig.enabled && styles.syncToggleOn]}
          onPress={() =>
            setSyncConfig((current) => ({
              ...current,
              enabled: !current.enabled,
              updatedAt: new Date().toISOString(),
            }))
          }
        >
          <Text
            style={[
              styles.syncToggleText,
              syncConfig.enabled && styles.syncToggleTextOn,
            ]}
          >
            {syncConfig.enabled ? "已启用" : "未启用"}
          </Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={syncConfig.baseUrl}
        onChangeText={(baseUrl) =>
          setSyncConfig((current) => ({
            ...current,
            baseUrl,
            updatedAt: new Date().toISOString(),
          }))
        }
        placeholder="https://your-sync.example/laphiny-sync"
        autoCapitalize="none"
        keyboardType="url"
      />
      <TextInput
        style={styles.input}
        value={syncConfig.apiKey}
        onChangeText={(apiKey) =>
          setSyncConfig((current) => ({
            ...current,
            apiKey,
            updatedAt: new Date().toISOString(),
          }))
        }
        placeholder="同步 API Key，可留空"
        autoCapitalize="none"
        secureTextEntry
      />
      <View style={styles.syncMetaRow}>
        <Text style={styles.help}>
          上次拉取：
          {syncConfig.lastPulledAt
            ? formatDateTime(syncConfig.lastPulledAt)
            : "无"}
        </Text>
        <Text style={styles.help}>
          上次推送：
          {syncConfig.lastPushedAt
            ? formatDateTime(syncConfig.lastPushedAt)
            : "无"}
        </Text>
        <Text style={styles.help}>
          事件轮询：
          {syncConfig.lastEventPulledAt
            ? formatDateTime(syncConfig.lastEventPulledAt)
            : "无"}
        </Text>
      </View>
      <View style={styles.buttonRow}>
        <SecondaryButton
          icon="pulse-outline"
          label={syncing ? "检查中..." : "测试后端"}
          onPress={testSyncBackend}
          disabled={syncing}
        />
        <SecondaryButton
          icon="git-compare-outline"
          label={checkingSyncConflicts ? "检查中..." : "检查差异"}
          onPress={checkSyncConflicts}
          disabled={syncing || checkingSyncConflicts}
        />
        <SecondaryButton
          icon="cloud-download-outline"
          label="拉取快照"
          onPress={pullSyncSnapshot}
          disabled={syncing || checkingSyncConflicts}
        />
        <PrimaryButton
          icon="cloud-upload-outline"
          label="推送快照"
          onPress={pushSyncSnapshot}
          disabled={syncing || checkingSyncConflicts}
        />
      </View>
      {syncConflictReport}
    </View>
  );
}
