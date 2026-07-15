import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { DEFAULT_MODEL } from '../config/app_config';
import { getErrorMessage, makeId, requestConfirm, showNotice } from '../app/app_utils';
import type { ConnectionFormState, ConnectionHealth } from '../app/app_types';
import { pickImages } from '../lib/attachments';
import { summarizeAgentProfile } from '../lib/agent_profile';
import {
  mergeImportedConnections,
  normalizeConnectionForm,
  parseImportedConnections,
  removeConnectionFromRooms,
  updateRoomsForConnectionRename,
} from '../lib/connection_management';
import { checkHermesConnection, generateAgentProfile } from '../lib/connection_runtime';
import type { ChatMessage, DiagnosticLogEntry, HermesConnection, Room, AgentProfileVersion } from '../types';

type LogInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

type UseConnectionRuntimeOptions = {
  connections: HermesConnection[];
  rooms: Room[];
  selectedRoomId: string | null;
  setConnections: Dispatch<SetStateAction<HermesConnection[]>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  setMessagesByRoom: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setProfileVersions: Dispatch<SetStateAction<AgentProfileVersion[]>>;
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>;
  setSelectedTargetIds: Dispatch<SetStateAction<string[]>>;
  appendDiagnosticLog: (input: LogInput) => void;
};

export function useConnectionRuntime({
  connections,
  rooms,
  selectedRoomId,
  setConnections,
  setRooms,
  setMessagesByRoom,
  setProfileVersions,
  setSelectedRoomId,
  setSelectedTargetIds,
  appendDiagnosticLog,
}: UseConnectionRuntimeOptions) {
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [profilingConnectionId, setProfilingConnectionId] = useState<string | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<Record<string, ConnectionHealth>>({});
  const [connectionForm, setConnectionForm] = useState<ConnectionFormState>({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionEditForm, setConnectionEditForm] = useState<ConnectionFormState>({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [jsonPaste, setJsonPaste] = useState('');

  const healthSummary = useMemo(() => {
    let ok = 0;
    let error = 0;
    let checking = 0;
    for (const connection of connections) {
      const status = connectionHealth[connection.id]?.status ?? 'unknown';
      if (status === 'ok') ok += 1;
      if (status === 'error') error += 1;
      if (status === 'checking') checking += 1;
    }
    return { ok, error, checking, unknown: Math.max(0, connections.length - ok - error - checking) };
  }, [connections, connectionHealth]);

  function addConnection() {
    const normalized = normalizeConnectionForm(connectionForm, DEFAULT_MODEL);
    if (!normalized.ok) {
      showNotice(normalized.title, normalized.message);
      return;
    }

    const now = new Date().toISOString();
    const connection: HermesConnection = {
      id: makeId('conn'),
      ...normalized.value,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    setConnections((current) => [...current, connection]);
    setConnectionForm({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  }

  function handlePasteImport() {
    const text = jsonPaste.trim();
    if (!text) return;
    importConnectionsFromText(text);
    setJsonPaste('');
  }

  function importConnectionsFromText(text: string) {
    const imported = parseImportedConnections(text, DEFAULT_MODEL, makeId);
    if (!imported.ok) {
      showNotice(imported.title, imported.message);
      return;
    }

    setConnections((current) => {
      const merged = mergeImportedConnections(current, imported.connections);
      if (merged.added === 0) {
        showNotice('没有新连接', '全部连接已存在');
        return current;
      }
      showNotice(
        '导入完成',
        `已导入 ${merged.added} 个连接${merged.skipped > 0 ? `，跳过 ${merged.skipped} 个已存在` : ''}`,
      );
      return merged.connections;
    });
  }

  async function importConnections() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;

      const text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      importConnectionsFromText(text);
    } catch (error) {
      showNotice('导入失败', getErrorMessage(error));
    }
  }

  async function testConnection(connection: HermesConnection) {
    setTestingConnectionId(connection.id);
    setConnectionHealth((current) => ({
      ...current,
      [connection.id]: { ...current[connection.id], status: 'checking' },
    }));
    try {
      const result = await checkHermesConnection(connection);
      if (result.status === 'ok') {
        setConnections((current) => current.map((item) => item.id === connection.id ? {
          ...item,
          toolDelegation: { ...result.toolDelegation, checkedAt: result.checkedAt },
          updatedAt: result.checkedAt,
        } : item));
        setConnectionHealth((current) => ({
          ...current,
          [connection.id]: {
            status: 'ok',
            latencyMs: result.latencyMs,
            modelsCount: result.modelsCount,
            checkedAt: result.checkedAt,
          },
        }));
        appendDiagnosticLog({
          level: 'success',
          category: 'connection',
          title: '连接测试成功',
          message: `${connection.name} 可用，模型数 ${result.modelsCount}。`,
          connectionId: connection.id,
          connectionName: connection.name,
          durationMs: result.latencyMs,
          meta: { models: result.modelsCount, status: result.rawStatus ?? 'ok', toolDelegation: result.toolDelegation.supported ? 'supported' : result.toolDelegation.reason ?? 'unsupported' },
        });
        showNotice('连接成功', `状态：${result.rawStatus ?? 'ok'}\n模型数：${result.modelsCount}\n工具委托：${result.toolDelegation.supported ? '可用' : result.toolDelegation.reason ?? '不可用'}`);
        return;
      }

      setConnectionHealth((current) => ({
        ...current,
        [connection.id]: {
          status: 'error',
          error: result.error,
          checkedAt: result.checkedAt,
        },
      }));
      appendDiagnosticLog({
        level: 'error',
        category: 'connection',
        title: '连接测试失败',
        message: result.error,
        connectionId: connection.id,
        connectionName: connection.name,
        durationMs: result.latencyMs,
      });
      showNotice('连接失败', result.error);
    } finally {
      setTestingConnectionId(null);
    }
  }

  async function refreshAgentProfile(connection: HermesConnection) {
    setProfilingConnectionId(connection.id);
    try {
      const profile = await generateAgentProfile(connection);
      setProfileVersions((current) => [
        ...current,
        {
          id: makeId('profile'),
          connectionId: connection.id,
          connectionName: connection.name,
          profile,
          note: connection.profile ? '自动更新协作卡片' : '首次生成协作卡片',
          createdAt: new Date().toISOString(),
        },
      ].slice(-100));
      setConnections((current) => current.map((item) => (
        item.id === connection.id
          ? { ...item, profile, updatedAt: new Date().toISOString() }
          : item
      )));
      appendDiagnosticLog({
        level: 'success',
        category: 'profile',
        title: '协作卡片已更新',
        message: summarizeAgentProfile(profile),
        connectionId: connection.id,
        connectionName: connection.name,
        meta: { strengths: profile.strengths.length, delegateWhen: profile.delegateWhen.length },
      });
      showNotice('协作卡片已更新', summarizeAgentProfile(profile));
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'profile',
        title: '协作卡片更新失败',
        message: getErrorMessage(error),
        connectionId: connection.id,
        connectionName: connection.name,
      });
      showNotice('协作卡片更新失败', getErrorMessage(error));
    } finally {
      setProfilingConnectionId(null);
    }
  }

  async function refreshConnectionHealth(showResult = false) {
    const targets = connections.filter((connection) => connection.enabled);
    if (targets.length === 0) {
      if (showResult) showNotice('没有可检查的连接', '请先启用至少一个 Hermes Gateway。');
      return;
    }

    setConnectionHealth((current) => {
      const next = { ...current };
      for (const connection of targets) {
        next[connection.id] = { ...next[connection.id], status: 'checking' };
      }
      return next;
    });

    const results = await Promise.all(targets.map((connection) => checkHermesConnection(connection)));

    setConnectionHealth((current) => {
      const next = { ...current };
      for (const result of results) {
        next[result.id] = result.status === 'ok'
          ? {
            status: 'ok',
            latencyMs: result.latencyMs,
            modelsCount: result.modelsCount,
            checkedAt: result.checkedAt,
            error: result.rawStatus && result.rawStatus !== 'ok' ? `状态：${result.rawStatus}` : undefined,
          }
          : {
            status: 'error',
            error: result.error,
            checkedAt: result.checkedAt,
          };
      }
      return next;
    });

    if (showResult) {
      const okCount = results.filter((result) => result.status === 'ok').length;
      appendDiagnosticLog({
        level: okCount === results.length ? 'success' : 'warning',
        category: 'connection',
        title: '批量健康检查完成',
        message: `${okCount}/${results.length} 个连接可用。`,
        meta: { ok: okCount, total: results.length },
      });
      showNotice('健康检查完成', `${okCount}/${results.length} 个连接可用。`);
    }
  }

  function toggleConnection(connectionId: string) {
    setConnections((current) => current.map((connection) => (
      connection.id === connectionId
        ? { ...connection, enabled: !connection.enabled, updatedAt: new Date().toISOString() }
        : connection
    )));
  }

  function beginEditConnection(connection: HermesConnection) {
    setEditingConnectionId(connection.id);
    setConnectionEditForm({
      name: connection.name,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
      model: connection.model,
    });
  }

  function cancelEditConnection() {
    setEditingConnectionId(null);
    setConnectionEditForm({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  }

  function saveConnectionEdit(connection: HermesConnection) {
    const normalized = normalizeConnectionForm(connectionEditForm, DEFAULT_MODEL);
    if (!normalized.ok) {
      showNotice(normalized.title, normalized.message);
      return;
    }

    const now = new Date().toISOString();
    setConnections((current) => current.map((item) => (
      item.id === connection.id ? { ...item, ...normalized.value, updatedAt: now } : item
    )));
    setRooms((current) => updateRoomsForConnectionRename(current, connection, normalized.value.name, now));
    cancelEditConnection();
    showNotice('连接已更新', `${connection.name} 已保存为 ${normalized.value.name}。`);
  }

  async function chooseConnectionAvatar(connection: HermesConnection) {
    try {
      const images = await pickImages();
      const image = images[0];
      if (!image?.dataUrl && !image?.uri) return;
      const avatarUri = image.dataUrl ?? image.uri;
      setConnections((current) => current.map((item) => (
        item.id === connection.id ? { ...item, avatarUri, updatedAt: new Date().toISOString() } : item
      )));
      showNotice('头像已更新', connection.name);
    } catch (error) {
      showNotice('头像选择失败', getErrorMessage(error));
    }
  }

  function clearConnectionAvatar(connection: HermesConnection) {
    setConnections((current) => current.map((item) => (
      item.id === connection.id ? { ...item, avatarUri: undefined, updatedAt: new Date().toISOString() } : item
    )));
  }

  function deleteConnection(connection: HermesConnection) {
    const directRoomIds = rooms
      .filter((room) => room.kind === 'direct' && room.members.some((member) => member.connectionId === connection.id))
      .map((room) => room.id);
    const groupCount = rooms.filter((room) => room.kind === 'group' && room.members.some((member) => member.connectionId === connection.id)).length;

    requestConfirm(
      '删除连接',
      `将删除 ${connection.name} 的连接配置${directRoomIds.length ? `，并删除 ${directRoomIds.length} 个对应单聊房间` : ''}${groupCount ? `，从 ${groupCount} 个群聊移除这个成员` : ''}。此操作不会删除其他 Hermes 服务数据。`,
      () => {
        const now = new Date().toISOString();
        setConnections((current) => current.filter((item) => item.id !== connection.id));
        setConnectionHealth((current) => {
          const next = { ...current };
          delete next[connection.id];
          return next;
        });
        setSelectedTargetIds((current) => current.filter((id) => id !== connection.id));
        setRooms((current) => {
          const next = removeConnectionFromRooms(current, connection.id, now).filter((room) => room.members.length > 0);
          if (selectedRoomId && !next.some((room) => room.id === selectedRoomId)) {
            setSelectedRoomId(next[0]?.id ?? null);
          }
          return next;
        });
        if (directRoomIds.length) {
          setMessagesByRoom((current) => {
            const next = { ...current };
            for (const roomId of directRoomIds) delete next[roomId];
            return next;
          });
        }
        if (editingConnectionId === connection.id) cancelEditConnection();
      },
    );
  }

  return {
    connectionEditForm,
    connectionForm,
    connectionHealth,
    editingConnectionId,
    healthSummary,
    jsonPaste,
    profilingConnectionId,
    testingConnectionId,
    addConnection,
    beginEditConnection,
    cancelEditConnection,
    chooseConnectionAvatar,
    clearConnectionAvatar,
    deleteConnection,
    handlePasteImport,
    importConnections,
    refreshAgentProfile,
    refreshConnectionHealth,
    saveConnectionEdit,
    setConnectionEditForm,
    setConnectionForm,
    setJsonPaste,
    testConnection,
    toggleConnection,
  };
}
