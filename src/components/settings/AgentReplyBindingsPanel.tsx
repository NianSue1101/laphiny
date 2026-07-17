import { useEffect, useMemo, useState, type ComponentType } from 'react';
import * as Clipboard from 'expo-clipboard';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import { showNotice } from '../../app/app_utils';
import { LaphinySyncClient } from '../../lib/sync_client';
import type { AgentReplyBinding, Room, SyncConfig } from '../../types';
import { SecondaryButton } from '../Primitives';

type Styles = Record<string, any>;

export function AgentReplyBindingsPanel({
  rooms,
  styles,
  syncConfig,
  TextComponent: Text,
}: {
  rooms: Room[];
  styles: Styles;
  syncConfig: SyncConfig;
  TextComponent: ComponentType<TextProps>;
}) {
  const [bindings, setBindings] = useState<AgentReplyBinding[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const enabledMembers = useMemo(() => rooms.flatMap((room) => room.members
    .filter((member) => member.enabled)
    .map((member) => ({ room, member }))), [rooms]);

  useEffect(() => {
    if (!syncConfig.enabled || !syncConfig.baseUrl.trim()) {
      setBindings([]);
      return;
    }
    let cancelled = false;
    void loadBindings().then((items) => {
      if (!cancelled && items) setBindings(items);
    });
    return () => {
      cancelled = true;
    };
  }, [syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey]);

  async function loadBindings() {
    try {
      const result = await new LaphinySyncClient(syncConfig).listAgentBindings({ timeoutMs: 8_000 });
      return result.bindings ?? [];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/HTTP 404:/u.test(message)) showNotice('主动回复通道读取失败', message);
      return null;
    }
  }

  async function createBinding(room: Room, connectionId: string, authorName: string) {
    const key = `${room.id}:${connectionId}`;
    setBusyKey(key);
    try {
      const client = new LaphinySyncClient(syncConfig);
      const created = await client.createAgentBinding({ roomId: room.id, connectionId, authorName }, { timeoutMs: 10_000 });
      const endpoint = `${syncConfig.baseUrl.trim().replace(/\/+$/u, '')}${created.endpoint}`;
      const setupText = [
        '# Laphiny 主动回复通道（请作为 Agent 主机密钥保存，不要公开）',
        `LAPHINY_REPLY_URL=${JSON.stringify(endpoint)}`,
        `LAPHINY_REPLY_TOKEN=${JSON.stringify(created.token)}`,
        `LAPHINY_REPLY_PROTOCOL=${JSON.stringify(created.protocol)}`,
        `LAPHINY_ROOM_ID=${JSON.stringify(room.id)}`,
        `LAPHINY_CONNECTION_ID=${JSON.stringify(connectionId)}`,
        '',
        '# Agent 定时任务完成后向 LAPHINY_REPLY_URL POST JSON。',
        '# HTTP Header: Authorization: Bearer $LAPHINY_REPLY_TOKEN',
        '# HTTP Header: Content-Type: application/json',
        JSON.stringify({
          protocol: created.protocol,
          idempotencyKey: 'timer:<stable-task-id>:<run-id>',
          content: '定时任务完成后的回复正文',
          replyToMessageId: '<optional-original-message-id>',
        }, null, 2),
      ].join('\n');
      await Clipboard.setStringAsync(setupText);
      setBindings((current) => [created.binding, ...current.filter((item) => item.id !== created.binding.id)]);
      showNotice('主动回复通道已创建', `${authorName} → ${room.name} 的配置已复制。令牌只显示这一次，请保存到 Agent 主机的安全环境变量中。`);
    } catch (error) {
      showNotice('主动回复通道创建失败', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeBinding(binding: AgentReplyBinding) {
    setBusyKey(binding.id);
    try {
      const revoked = await new LaphinySyncClient(syncConfig).revokeAgentBinding(binding.id, { timeoutMs: 8_000 });
      setBindings((current) => current.map((item) => item.id === revoked.id ? revoked : item));
      showNotice('主动回复通道已撤销', '该令牌不能再向房间发送新消息。');
    } catch (error) {
      showNotice('撤销失败', error instanceof Error ? error.message : String(error));
    } finally {
      setBusyKey(null);
    }
  }

  const activeBindings = bindings.filter((binding) => !binding.revokedAt);

  return (
    <View style={styles.settingsEmbeddedPanel}>
      <View style={styles.syncHeader}>
        <View style={styles.syncHeaderText}>
          <Text style={styles.cardTitle}>Agent 主动回复通道</Text>
          <Text style={styles.help}>
            为某个房间成员生成最小权限令牌。Agent 的脚本即使在原请求结束后运行，也能把结果投递回这个固定房间。
          </Text>
        </View>
        <Text style={styles.squareCount}>{activeBindings.length} 个有效通道</Text>
      </View>

      {!syncConfig.enabled || !syncConfig.baseUrl.trim() ? (
        <Text style={styles.help}>先启用上方独立 laphiny-sync 后端，再创建主动回复通道。</Text>
      ) : null}

      {syncConfig.enabled && syncConfig.baseUrl.trim() ? enabledMembers.map(({ room, member }) => {
        const key = `${room.id}:${member.connectionId}`;
        const existingCount = activeBindings.filter((binding) => binding.roomId === room.id && binding.connectionId === member.connectionId).length;
        return (
          <View key={key} style={styles.settingsToggleRow}>
            <View style={styles.settingsToggleInfo}>
              <View style={styles.settingsToggleCopy}>
                <Text style={styles.storageInfoTitle}>{member.alias} → {room.name}</Text>
                <Text style={styles.storageInfoText}>{existingCount ? `${existingCount} 个有效令牌` : '尚未授权主动投递'}</Text>
              </View>
            </View>
            <SecondaryButton
              icon="key-outline"
              label={busyKey === key ? '生成中...' : '生成并复制'}
              onPress={() => void createBinding(room, member.connectionId, member.alias)}
              disabled={busyKey !== null}
            />
          </View>
        );
      }) : null}

      {activeBindings.length ? (
        <View style={styles.syncMetaRow}>
          {activeBindings.map((binding) => {
            const room = rooms.find((item) => item.id === binding.roomId);
            return (
              <TouchableOpacity
                key={binding.id}
                style={styles.memberChip}
                disabled={busyKey !== null}
                onPress={() => void revokeBinding(binding)}
              >
                <Text style={styles.memberChipText}>撤销 {binding.authorName} → {room?.name ?? binding.roomId}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
