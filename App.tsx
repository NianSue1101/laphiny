import 'react-native-url-polyfill/auto';

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';

import { pickDocuments, pickImages } from './src/lib/attachments';
import { HermesClient } from './src/lib/hermes_client';
import { resolveAssistantMentions, resolveMentionTargets } from './src/lib/mentions';
import { buildHermesUserContent } from './src/lib/payload';
import { LaphinySyncClient } from './src/lib/sync_client';
import {
  loadConnections,
  loadMessages,
  loadRooms,
  loadSquareEvents,
  loadSyncConfig,
  saveConnections,
  saveMessages,
  saveRooms,
  saveSquareEvents,
  saveSyncConfig,
} from './src/storage/repository';
import { Attachment, ChatMessage, HermesChatMessage, HermesConnection, Room, RoomMember, SquareEvent, SyncConfig, SyncSnapshot } from './src/types';

type Tab = 'chat' | 'connections' | 'rooms' | 'square';
type IconName = keyof typeof Ionicons.glyphMap;
type QuickCommand = {
  id: string;
  label: string;
  icon: IconName;
  targetAlias: string;
  prompt: string;
};
type ConnectionHealth = {
  status: 'unknown' | 'checking' | 'ok' | 'error';
  latencyMs?: number;
  modelsCount?: number;
  checkedAt?: string;
  error?: string;
};

const DEFAULT_MODEL = 'hermes-agent';

const DEFAULT_API_KEY = '24a799bdc0ad4c0d73235ee83aae435a2e5b2cae4d7494abb120f7e15a0ba377';
const DEFAULT_CONTEXT_LIMIT = 20;

const QUICK_COMMANDS: QuickCommand[] = [
  {
    id: 'deploy',
    label: '构建部署',
    icon: 'rocket-outline',
    targetAlias: 'Laper',
    prompt: '请检查当前项目状态，执行构建部署流程，并返回结果和下一步建议。',
  },
  {
    id: 'daily',
    label: '日报',
    icon: 'newspaper-outline',
    targetAlias: 'Derux',
    prompt: '请整理今天的进展日报，按已完成、风险、明日计划输出。',
  },
  {
    id: 'fund',
    label: '查基金',
    icon: 'stats-chart-outline',
    targetAlias: 'Derux',
    prompt: '请查询并总结我关注的基金/市场信息，给出需要注意的变化。',
  },
  {
    id: 'summarize',
    label: '总结房间',
    icon: 'reader-outline',
    targetAlias: 'Flor',
    prompt: '请总结当前房间最近的对话，提炼待办、结论和未解决问题。',
  },
];

const STATUS_LABELS: Record<ChatMessage['status'], string> = {
  local: '提示',
  queued: '排队',
  running: '思考中',
  sent: '已发送',
  stopped: '已停止',
  error: '失败',
};

const DEFAULT_CONNECTIONS: HermesConnection[] = [
  {
    id: makeId('conn'),
    name: 'Flor',
    baseUrl: 'https://nianxxz.site/hermes-api',
    apiKey: DEFAULT_API_KEY,
    model: DEFAULT_MODEL,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: makeId('conn'),
    name: 'Laper',
    baseUrl: 'https://nianxxz.site/laper-api',
    apiKey: DEFAULT_API_KEY,
    model: DEFAULT_MODEL,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: makeId('conn'),
    name: 'Arilphin',
    baseUrl: 'https://nianxxz.site/arilphin-api',
    apiKey: DEFAULT_API_KEY,
    model: DEFAULT_MODEL,
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export default function App() {
  const [hydrated, setHydrated] = useState(false);
  const [connections, setConnections] = useState<HermesConnection[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [messagesByRoom, setMessagesByRoom] = useState<Record<string, ChatMessage[]>>({});
  const [squareEvents, setSquareEvents] = useState<SquareEvent[]>([]);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>({ enabled: false, baseUrl: '', apiKey: '', updatedAt: new Date().toISOString() });
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<Tab>('chat');
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [activeStreamIds, setActiveStreamIds] = useState<Record<string, true>>({});
  const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
  const [quickCommandsOpen, setQuickCommandsOpen] = useState(false);
  const [roomToolsOpen, setRoomToolsOpen] = useState(false);
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [connectionHealth, setConnectionHealth] = useState<Record<string, ConnectionHealth>>({});
  const [syncing, setSyncing] = useState(false);
  const [connectionForm, setConnectionForm] = useState({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [jsonPaste, setJsonPaste] = useState('');
  const [groupName, setGroupName] = useState('Hermes 群聊');
  const hydratedRef = useRef(false);
  const messageScrollRef = useRef<ScrollView | null>(null);
  const streamControllersRef = useRef<Record<string, AbortController>>({});
  const pollingSquareEventsRef = useRef(false);
  const { width } = useWindowDimensions();

  useEffect(() => {
    let mounted = true;

    Promise.all([loadConnections(), loadRooms(), loadMessages(), loadSyncConfig(), loadSquareEvents()])
      .then(([loadedConnections, loadedRooms, loadedMessages, loadedSyncConfig, loadedSquareEvents]) => {
        if (!mounted) return;
        let finalConnections = loadedConnections;
        if (finalConnections.length === 0) {
          finalConnections = DEFAULT_CONNECTIONS;
          void saveConnections(finalConnections);
        }
        setConnections(finalConnections);
        setRooms(loadedRooms);
        setMessagesByRoom(loadedMessages);
        setSyncConfig(loadedSyncConfig);
        setSquareEvents(loadedSquareEvents);
        setSelectedRoomId(loadedRooms[0]?.id ?? null);
        hydratedRef.current = true;
        setHydrated(true);
      })
      .catch((error) => {
        showNotice('加载本地数据失败', getErrorMessage(error));
        hydratedRef.current = true;
        setHydrated(true);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (hydratedRef.current) void saveConnections(connections);
  }, [connections]);

  useEffect(() => {
    if (hydratedRef.current) void saveRooms(rooms);
  }, [rooms]);

  useEffect(() => {
    if (hydratedRef.current) void saveMessages(messagesByRoom);
  }, [messagesByRoom]);

  useEffect(() => {
    if (hydratedRef.current) void saveSyncConfig(syncConfig);
  }, [syncConfig]);

  useEffect(() => {
    if (hydratedRef.current) void saveSquareEvents(squareEvents);
  }, [squareEvents]);

  const connectionById = useMemo(() => new Map(connections.map((connection) => [connection.id, connection])), [connections]);
  const enabledConnections = useMemo(() => connections.filter((connection) => connection.enabled), [connections]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedMessages = selectedRoom ? messagesByRoom[selectedRoom.id] ?? [] : [];
  const isWideLayout = width >= 900;
  const sending = Object.keys(activeStreamIds).length > 0;
  const totalUnread = Object.values(unreadByRoom).reduce((total, count) => total + count, 0);
  const selectedTargetSet = useMemo(() => new Set(selectedTargetIds), [selectedTargetIds]);
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

  useEffect(() => {
    setSelectedTargetIds([]);
  }, [selectedRoomId]);

  useEffect(() => {
    if (selectedRoomId && tab === 'chat') {
      setUnreadByRoom((current) => {
        if (!current[selectedRoomId]) return current;
        const next = { ...current };
        delete next[selectedRoomId];
        return next;
      });
    }
    if (tab === 'square') {
      setUnreadByRoom((current) => {
        if (!current.__square) return current;
        const next = { ...current };
        delete next.__square;
        return next;
      });
    }
  }, [selectedRoomId, tab]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = totalUnread > 0 ? `(${totalUnread}) Laphiny` : 'Laphiny';
    }
  }, [totalUnread]);

  useEffect(() => {
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;
    let cancelled = false;

    const poll = async () => {
      if (pollingSquareEventsRef.current) return;
      pollingSquareEventsRef.current = true;
      try {
        const client = new LaphinySyncClient(syncConfig);
        const since = syncConfig.lastEventPulledAt ?? latestSquareEventTime(squareEvents);
        const events = await client.listEvents({ since, timeoutMs: 10_000 });
        if (cancelled || events.length === 0) return;

        setSquareEvents((current) => mergeSquareEvents([...current, ...events]).slice(-300));
        const latest = latestSquareEventTime(events);
        setSyncConfig((current) => ({
          ...current,
          lastEventPulledAt: latest || current.lastEventPulledAt,
          updatedAt: new Date().toISOString(),
        }));
        if (tab !== 'square') {
          setUnreadByRoom((current) => ({
            ...current,
            __square: (current.__square ?? 0) + events.length,
          }));
        }
      } catch {
        // Polling should stay quiet; manual sync actions surface errors.
      } finally {
        pollingSquareEventsRef.current = false;
      }
    };

    void poll();
    const intervalId = setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey, syncConfig.lastEventPulledAt, squareEvents, tab]);

  function addConnection() {
    const name = connectionForm.name.trim();
    const baseUrl = connectionForm.baseUrl.trim().replace(/\/+$/, '');
    const apiKey = connectionForm.apiKey.trim();
    const model = connectionForm.model.trim() || DEFAULT_MODEL;

    if (!name || !baseUrl) {
      showNotice('请填写连接名称和 Hermes API 地址');
      return;
    }

    try {
      const url = new URL(baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        showNotice('Hermes API 地址必须以 http:// 或 https:// 开头');
        return;
      }
    } catch {
      showNotice('Hermes API 地址格式不正确');
      return;
    }

    const now = new Date().toISOString();
    const connection: HermesConnection = {
      id: makeId('conn'),
      name,
      baseUrl,
      apiKey,
      model,
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
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      showNotice('JSON 格式错误', '文本不是有效的 JSON');
      return;
    }

    if (!Array.isArray(data)) {
      showNotice('JSON 格式错误', 'JSON 必须是连接对象数组');
      return;
    }

    const now = new Date().toISOString();
    const imported: HermesConnection[] = [];
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (!item || typeof item !== 'object') continue;
      const name = String((item as Record<string, unknown>).name ?? '').trim();
      const baseUrl = String((item as Record<string, unknown>).baseUrl ?? '').trim();
      if (!name || !baseUrl) continue;

      imported.push({
        id: makeId('conn'),
        name,
        baseUrl,
        apiKey: String((item as Record<string, unknown>).apiKey ?? ''),
        model: String((item as Record<string, unknown>).model || DEFAULT_MODEL),
        enabled: (item as Record<string, unknown>).enabled !== false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (imported.length === 0) {
      showNotice('没有可导入的连接', 'JSON 中没有有效的连接数据');
      return;
    }

    setConnections((current) => {
      const existingNames = new Set(current.map((c) => c.name));
      const newOnes = imported.filter((c) => !existingNames.has(c.name));
      if (newOnes.length === 0) {
        showNotice('没有新连接', '全部连接已存在');
        return current;
      }
      const skipped = imported.length - newOnes.length;
      showNotice(
        '导入完成',
        `已导入 ${newOnes.length} 个连接${skipped > 0 ? `，跳过 ${skipped} 个已存在` : ''}`,
      );
      return [...current, ...newOnes];
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
    const startedAt = Date.now();
    try {
      const client = new HermesClient(connection);
      const [health, models] = await Promise.all([client.health({ timeoutMs: 8_000 }), client.models({ timeoutMs: 8_000 })]);
      const latencyMs = Date.now() - startedAt;
      setConnectionHealth((current) => ({
        ...current,
        [connection.id]: {
          status: 'ok',
          latencyMs,
          modelsCount: models.length,
          checkedAt: new Date().toISOString(),
        },
      }));
      showNotice('连接成功', `状态：${health.status ?? 'ok'}\n模型数：${models.length}`);
    } catch (error) {
      setConnectionHealth((current) => ({
        ...current,
        [connection.id]: {
          status: 'error',
          error: getErrorMessage(error),
          checkedAt: new Date().toISOString(),
        },
      }));
      showNotice('连接失败', getErrorMessage(error));
    } finally {
      setTestingConnectionId(null);
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

    const results = await Promise.all(targets.map(async (connection) => {
      const startedAt = Date.now();
      try {
        const client = new HermesClient(connection);
        const [health, models] = await Promise.all([client.health({ timeoutMs: 8_000 }), client.models({ timeoutMs: 8_000 })]);
        return {
          id: connection.id,
          health: {
            status: 'ok' as const,
            latencyMs: Date.now() - startedAt,
            modelsCount: models.length,
            checkedAt: new Date().toISOString(),
            error: health.status && health.status !== 'ok' ? `状态：${health.status}` : undefined,
          },
        };
      } catch (error) {
        return {
          id: connection.id,
          health: {
            status: 'error' as const,
            error: getErrorMessage(error),
            checkedAt: new Date().toISOString(),
          },
        };
      }
    }));

    setConnectionHealth((current) => {
      const next = { ...current };
      for (const result of results) {
        next[result.id] = result.health;
      }
      return next;
    });

    if (showResult) {
      const okCount = results.filter((result) => result.health.status === 'ok').length;
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

  function createDirectRoom(connection: HermesConnection) {
    const existing = rooms.find((room) => room.kind === 'direct' && room.members[0]?.connectionId === connection.id);
    if (existing) {
      setSelectedRoomId(existing.id);
      setTab('chat');
      return;
    }

    const room = makeRoom(connection.name, 'direct', [{ connectionId: connection.id, alias: connection.name, enabled: true }]);
    setRooms((current) => [...current, room]);
    setSelectedRoomId(room.id);
    setTab('chat');
  }

  function createGroupRoom() {
    const members = enabledConnections.map<RoomMember>((connection) => ({
      connectionId: connection.id,
      alias: connection.name,
      enabled: true,
    }));

    if (members.length < 2) {
      showNotice('群聊至少需要两个已启用 Hermes 连接');
      return;
    }

    const room = makeRoom(groupName.trim() || 'Hermes 群聊', 'group', members);
    setRooms((current) => [...current, room]);
    setSelectedRoomId(room.id);
    setTab('chat');
  }

  async function attachImages() {
    try {
      const images = await pickImages();
      setPendingAttachments((current) => [...current, ...images]);
    } catch (error) {
      showNotice('选择图片失败', getErrorMessage(error));
    }
  }

  async function attachDocuments() {
    try {
      const documents = await pickDocuments();
      setPendingAttachments((current) => [...current, ...documents]);
    } catch (error) {
      showNotice('选择文件失败', getErrorMessage(error));
    }
  }

  function appendMessagesToRoom(roomId: string, messages: ChatMessage[]) {
    setMessagesByRoom((current) => ({
      ...current,
      [roomId]: [...(current[roomId] ?? []), ...messages],
    }));
    for (const message of messages) {
      if (message.authorId === 'system') {
        appendSquareEvent(makeSquareEventFromMessage(roomId, message));
      }
    }
    const incomingCount = messages.filter((message) => message.authorId !== 'user').length;
    if (incomingCount > 0 && (roomId !== selectedRoomId || tab !== 'chat')) {
      setUnreadByRoom((current) => ({
        ...current,
        [roomId]: (current[roomId] ?? 0) + incomingCount,
      }));
    }
  }

  function updateMessageInRoom(roomId: string, messageId: string, patch: Partial<ChatMessage>) {
    let completedMessage: ChatMessage | null = null;
    setMessagesByRoom((current) => ({
      ...current,
      [roomId]: (current[roomId] ?? []).map((message) => (
        message.id === messageId
          ? (() => {
              const next = { ...message, ...patch };
              if (message.authorId !== 'user' && patch.status && patch.status !== 'running') {
                completedMessage = next;
              }
              return next;
            })()
          : message
      )),
    }));
    if (completedMessage) {
      appendSquareEvent(makeSquareEventFromMessage(roomId, completedMessage));
    }
  }

  function setStreamActive(messageId: string, active: boolean) {
    setActiveStreamIds((current) => {
      if (active) return { ...current, [messageId]: true };
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function toggleTargetSelection(connectionId: string) {
    setSelectedTargetIds((current) => (
      current.includes(connectionId)
        ? current.filter((id) => id !== connectionId)
        : [...current, connectionId]
    ));
  }

  function selectAllTargets() {
    if (!selectedRoom) return;
    const enabledMemberIds = selectedRoom.members.filter((member) => member.enabled).map((member) => member.connectionId);
    setSelectedTargetIds((current) => (current.length === enabledMemberIds.length ? [] : enabledMemberIds));
  }

  function stopMessage(messageId: string) {
    streamControllersRef.current[messageId]?.abort();
  }

  function getSendTargets(room: Room, rawText: string, explicitTargetIds = selectedTargetIds): { targets: RoomMember[]; textForHermes: string } {
    const resolution = resolveMentionTargets(room, rawText);
    const explicitTargetSet = new Set(explicitTargetIds);
    const manuallySelectedTargets = room.members.filter((member) => (
      member.enabled && explicitTargetSet.has(member.connectionId)
    ));

    if (room.kind === 'group' && manuallySelectedTargets.length > 0) {
      return {
        targets: manuallySelectedTargets,
        textForHermes: resolution.strippedText || rawText,
      };
    }

    return {
      targets: resolution.targets,
      textForHermes: resolution.strippedText || rawText,
    };
  }

  async function streamHermesReply({
    room,
    member,
    placeholderId,
    text,
    attachments,
    previousMessages,
  }: {
    room: Room;
    member: RoomMember;
    placeholderId: string;
    text: string;
    attachments: Attachment[];
    previousMessages: ChatMessage[];
  }) {
    const connection = connectionById.get(member.connectionId);
    if (!connection) {
      updateMessageInRoom(room.id, placeholderId, { status: 'error', error: 'Hermes 连接不存在', content: '发送失败' });
      return;
    }

    const controller = new AbortController();
    streamControllersRef.current[placeholderId] = controller;
    setStreamActive(placeholderId, true);

    let streamedText = '';
    updateMessageInRoom(room.id, placeholderId, { content: '', status: 'running', error: undefined });

    try {
      const client = new HermesClient(connection);
      for await (const chunk of client.chatCompletionStream({
        model: connection.model,
        messages: buildChatHistory(previousMessages, room, member, text, attachments, room.contextLimit ?? DEFAULT_CONTEXT_LIMIT),
        stream: true,
      }, {
        sessionId: room.sessionIds[connection.id],
        sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
        timeoutMs: 120_000,
        signal: controller.signal,
      })) {
        streamedText += chunk;
        updateMessageInRoom(room.id, placeholderId, { content: streamedText });
      }

      updateMessageInRoom(room.id, placeholderId, {
        content: streamedText.trim() || '[Hermes 没有返回内容]',
        status: 'sent',
      });
    } catch (error) {
      if (isAbortError(error)) {
        updateMessageInRoom(room.id, placeholderId, {
          content: streamedText.trim() || '已停止生成',
          status: 'stopped',
        });
        return;
      }

      updateMessageInRoom(room.id, placeholderId, {
        status: 'error',
        error: getErrorMessage(error),
        content: streamedText.trim() || '发送失败',
      });
    } finally {
      delete streamControllersRef.current[placeholderId];
      setStreamActive(placeholderId, false);
    }
  }

  async function dispatchMessage(room: Room, rawText: string, attachments: Attachment[], explicitTargetIds = selectedTargetIds) {
    if (!rawText && attachments.length === 0) {
      return;
    }

    const previousMessages = selectedMessages;
    const { targets, textForHermes } = getSendTargets(room, rawText, explicitTargetIds);
    const now = new Date().toISOString();
    const userMessage: ChatMessage = {
      id: makeId('msg'),
      roomId: room.id,
      role: 'user',
      authorId: 'user',
      authorName: '你',
      content: rawText || '[附件]',
      attachments,
      status: 'sent',
      createdAt: now,
    };

    setDraft('');
    setPendingAttachments([]);
    setSelectedTargetIds([]);
    appendMessagesToRoom(room.id, [userMessage]);

    if (targets.length === 0) {
      const errorText = room.kind === 'group'
        ? '请选择本次回复成员，或使用 @成员名 / @all 触发 Hermes 回复。'
        : '这个房间没有可用的 Hermes 成员。';
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, errorText)]);
      return;
    }

    const assistantPlaceholders = targets.map((member) => makeAssistantPlaceholder(room.id, member));
    appendMessagesToRoom(room.id, assistantPlaceholders);

    const firstRoundResponses = new Map<string, { content: string; member: RoomMember }>();

    await Promise.all(assistantPlaceholders.map(async (placeholder, index) => {
      const member = targets[index];
      if (!member) return;
      const connection = connectionById.get(member.connectionId);
      if (!connection) {
        updateMessageInRoom(room.id, placeholder.id, { status: 'error', error: 'Hermes 连接不存在' });
        return;
      }

      try {
        const client = new HermesClient(connection);
        updateMessageInRoom(room.id, placeholder.id, { status: 'running', content: '' });

        let accumulated = '';
        for await (const chunk of client.chatCompletionStream({
          model: connection.model,
          messages: buildChatHistory(selectedMessages, room, member, textForHermes, pendingAttachments),
          stream: true,
        }, {
          sessionId: room.sessionIds[connection.id],
          sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
          timeoutMs: 120_000,
        })) {
          accumulated += chunk;
          updateMessageInRoom(room.id, placeholder.id, { content: accumulated });
        }

        const answer = accumulated.trim() || '[Hermes 没有返回内容]';
        firstRoundResponses.set(placeholder.id, { content: answer, member });
        updateMessageInRoom(room.id, placeholder.id, { content: answer, status: 'sent' });
      } catch (error) {
        updateMessageInRoom(room.id, placeholder.id, {
          status: 'error',
          error: getErrorMessage(error),
          content: '发送失败',
        });
      }
    }));

    // Auto-forward: check if any agent delegated to another via @mention
    if (room.kind === 'group') {
      for (const [, { content, member }] of firstRoundResponses) {
        const forwardResolution = resolveAssistantMentions(room, content, member.connectionId);
        if (forwardResolution.targets.length === 0) continue;

        const forwardPlaceholders = forwardResolution.targets.map((target) => {
          const placeholder = makeAssistantPlaceholder(room.id, target);
          placeholder.delegatedFrom = member.alias;
          return placeholder;
        });
        appendMessagesToRoom(room.id, forwardPlaceholders);

        await Promise.all(forwardPlaceholders.map(async (placeholder, idx) => {
          const target = forwardResolution.targets[idx];
          if (!target) return;
          const connection = connectionById.get(target.connectionId);
          if (!connection) {
            updateMessageInRoom(room.id, placeholder.id, { status: 'error', error: 'Hermes 连接不存在' });
            return;
          }

          try {
            const client = new HermesClient(connection);
            updateMessageInRoom(room.id, placeholder.id, { status: 'running', content: '' });

            const historyMsgs = buildChatHistoryForDelegation(
              selectedMessages,
              room,
              target,
              forwardResolution.strippedText,
              member.alias,
              content,
            );

            let accumulated = '';
            for await (const chunk of client.chatCompletionStream({
              model: connection.model,
              messages: historyMsgs,
              stream: true,
            }, {
              sessionId: room.sessionIds[connection.id],
                sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
              timeoutMs: 120_000,
            })) {
              accumulated += chunk;
              updateMessageInRoom(room.id, placeholder.id, { content: accumulated });
            }

            const answer = accumulated.trim() || '[Hermes 没有返回内容]';
            updateMessageInRoom(room.id, placeholder.id, { content: answer, status: 'sent' });
          } catch (error) {
            updateMessageInRoom(room.id, placeholder.id, {
              status: 'error',
              error: getErrorMessage(error),
              content: '转发失败',
            });
          }
        }));
      }
    }
  }

  async function sendMessage() {
    if (!selectedRoom) {
      showNotice('请先创建或选择房间');
      return;
    }

    const rawText = draft.trim();
    await dispatchMessage(selectedRoom, rawText, pendingAttachments);
  }

  async function retryMessage(message: ChatMessage) {
    if (!selectedRoom || message.authorId === 'user' || message.authorId === 'system') return;
    if (activeStreamIds[message.id]) return;

    const member = selectedRoom.members.find((item) => item.connectionId === message.authorId);
    if (!member) {
      showNotice('无法重试', '这个 Hermes 成员不在当前房间中。');
      return;
    }

    const messageIndex = selectedMessages.findIndex((item) => item.id === message.id);
    const userMessageIndex = findPreviousUserMessageIndex(selectedMessages, messageIndex);
    if (userMessageIndex < 0) {
      showNotice('无法重试', '没有找到这条回复对应的用户消息。');
      return;
    }

    const userMessage = selectedMessages[userMessageIndex];
    if (!userMessage) {
      showNotice('无法重试', '这条回复对应的用户消息已不存在。');
      return;
    }

    // Re-dispatch the original message content through dispatchMessage
    // which handles streaming, auto-forward, and all edge cases properly.
    const originalText = userMessage.content.replace(/^\[附件\]$/, '');
    const originalAttachments = userMessage.attachments ?? [];
    await dispatchMessage(selectedRoom, originalText, originalAttachments);
  }

  function insertMention(token: string) {
    setDraft((current) => {
      const spacer = current.length === 0 || /\s$/.test(current) ? '' : ' ';
      return `${current}${spacer}${token} `;
    });
  }

  async function runQuickCommand(command: QuickCommand) {
    if (!selectedRoom) {
      showNotice('请先选择房间');
      return;
    }

    const targetMember = selectedRoom.members.find((member) => (
      member.enabled && member.alias.toLowerCase() === command.targetAlias.toLowerCase()
    ));
    const fallbackMember = selectedRoom.kind === 'direct' ? selectedRoom.members.find((member) => member.enabled) : undefined;
    const member = targetMember ?? fallbackMember;
    if (!member) {
      showNotice('无法发送快捷指令', `当前房间没有可用的 ${command.targetAlias}。`);
      return;
    }

    await dispatchMessage(selectedRoom, command.prompt, [], [member.connectionId]);
  }

  function updateSelectedRoom(patch: Partial<Room>) {
    if (!selectedRoom) return;
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => (
      room.id === selectedRoom.id ? { ...room, ...patch, updatedAt: now } : room
    )));
  }

  function updateContextLimit(delta: number) {
    if (!selectedRoom) return;
    const currentLimit = selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    updateSelectedRoom({ contextLimit: Math.max(4, Math.min(80, currentLimit + delta)) });
  }

  function resetRoomSession() {
    if (!selectedRoom) return;
    requestConfirm('清空 Hermes 记忆', '将为当前房间生成新的 sessionKey，后续请求不会继续旧会话。', () => {
      updateSelectedRoom({
        sessionIds: {},
        sessionKey: `laphiny-${selectedRoom.id}-${Date.now().toString(36)}`,
      });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, '已重置当前房间的 Hermes 会话。')]);
    });
  }

  function clearSelectedRoomMessages() {
    if (!selectedRoom) return;
    requestConfirm('清空本地记录', '这只会清空当前设备里的这个房间消息，不会删除连接配置。', () => {
      setMessagesByRoom((current) => ({
        ...current,
        [selectedRoom.id]: [],
      }));
    });
  }

  async function exportSelectedRoom(format: 'json' | 'markdown') {
    if (!selectedRoom) return;
    const messages = messagesByRoom[selectedRoom.id] ?? [];
    const text = format === 'json'
      ? JSON.stringify({ room: selectedRoom, messages }, null, 2)
      : buildMarkdownExport(selectedRoom, messages);

    await Clipboard.setStringAsync(text);
    showNotice(format === 'json' ? 'JSON 已复制' : 'Markdown 已复制', '当前房间记录已复制到剪贴板。');
  }

  function appendSquareEvent(event: SquareEvent) {
    setSquareEvents((current) => mergeSquareEvents([...current, event]).slice(-300));
  }

  function makeSquareEventFromMessage(roomId: string, message: ChatMessage): SquareEvent {
    const room = rooms.find((item) => item.id === roomId);
    const kind: SquareEvent['kind'] = message.authorId === 'system' ? 'system' : 'message';
    return {
      id: `evt_${message.id}_${message.status}`,
      kind,
      source: message.authorName,
      roomId,
      roomName: room?.name,
      title: kind === 'system' ? '系统提示' : `${message.authorName} 更新`,
      body: message.error ? `${message.content}\n\n${message.error}` : message.content,
      createdAt: new Date().toISOString(),
    };
  }

  function makeSyncClient(): LaphinySyncClient | null {
    if (!syncConfig.enabled || !syncConfig.baseUrl.trim()) return null;
    return new LaphinySyncClient(syncConfig);
  }

  function buildSyncSnapshot(): SyncSnapshot {
    return {
      connections,
      rooms,
      messagesByRoom,
      squareEvents,
      updatedAt: new Date().toISOString(),
    };
  }

  function applySyncSnapshot(snapshot: SyncSnapshot) {
    setConnections((current) => mergeByUpdatedAt(current, snapshot.connections));
    setRooms((current) => mergeByUpdatedAt(current, snapshot.rooms));
    setMessagesByRoom((current) => mergeMessagesByRoom(current, snapshot.messagesByRoom));
    setSquareEvents((current) => mergeSquareEvents([...current, ...(snapshot.squareEvents ?? [])]).slice(-300));
  }

  async function testSyncBackend() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    try {
      const health = await client.health({ timeoutMs: 8_000 });
      showNotice('同步后端可用', `状态：${health.status ?? 'ok'}`);
    } catch (error) {
      showNotice('同步后端不可用', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function pushSyncSnapshot() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    try {
      const snapshot = await client.pushSnapshot(buildSyncSnapshot(), { timeoutMs: 20_000 });
      applySyncSnapshot(snapshot);
      setSyncConfig((current) => ({ ...current, lastPushedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      showNotice('已推送同步快照', '本机房间、消息和广场事件已发送到后端。');
    } catch (error) {
      showNotice('推送失败', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function pullSyncSnapshot() {
    const client = makeSyncClient();
    if (!client) {
      showNotice('同步未启用', '请先启用同步并填写后端地址。');
      return;
    }
    setSyncing(true);
    try {
      const snapshot = await client.pullSnapshot({ timeoutMs: 20_000 });
      applySyncSnapshot(snapshot);
      setSyncConfig((current) => ({ ...current, lastPulledAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      showNotice('已拉取同步快照', '远端数据已合并到本机。');
    } catch (error) {
      showNotice('拉取失败', getErrorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.muted}>正在加载 Laphiny...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Text style={styles.title}>Laphiny</Text>
          <Text style={styles.subtitle}>多 Hermes 协作聊天</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Ionicons name="chatbubbles-outline" size={14} color="#1f2937" />
            <Text style={styles.statText}>{rooms.length} 房间</Text>
          </View>
          <View style={[styles.statPill, styles.statPillAccent]}>
            <Ionicons name="radio-outline" size={14} color="#065f46" />
            <Text style={[styles.statText, styles.statTextAccent]}>{enabledConnections.length} 可用</Text>
          </View>
          {totalUnread > 0 ? (
            <View style={styles.unreadPill}>
              <Ionicons name="notifications" size={14} color="#991b1b" />
              <Text style={styles.unreadPillText}>{totalUnread} 未读</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton icon="chatbubble-ellipses-outline" label="聊天" active={tab === 'chat'} onPress={() => setTab('chat')} />
        <TabButton icon="planet-outline" label="广场" active={tab === 'square'} onPress={() => setTab('square')} />
        <TabButton icon="albums-outline" label="房间" active={tab === 'rooms'} onPress={() => setTab('rooms')} />
        <TabButton icon="git-network-outline" label="连接" active={tab === 'connections'} onPress={() => setTab('connections')} />
      </View>

      {tab === 'chat' ? renderChat() : null}
      {tab === 'square' ? renderSquare() : null}
      {tab === 'rooms' ? renderRooms() : null}
      {tab === 'connections' ? renderConnections() : null}
    </SafeAreaView>
  );

  function renderChat() {
    return (
      <View style={[styles.content, isWideLayout && styles.chatDesktop]}>
        {isWideLayout ? renderChatSidebar() : renderRoomRail()}
        <View style={styles.chatMain}>

        {selectedRoom ? (
          <View style={styles.chatHeader}>
            <View style={styles.roomTitleBlock}>
              <Text style={styles.roomTitle}>{selectedRoom.name}</Text>
              <Text style={styles.roomSummary}>
                {selectedRoom.kind === 'group' ? '群聊' : '单聊'} · {selectedRoom.members.length} 位 Hermes · 上下文 {selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT} 条
              </Text>
            </View>
            <View style={styles.roomHeaderActions}>
              <MiniButton
                icon={quickCommandsOpen ? 'flash' : 'flash-outline'}
                label="指令"
                onPress={() => setQuickCommandsOpen((open) => !open)}
              />
              <MiniButton
                icon={roomToolsOpen ? 'options' : 'options-outline'}
                label="工具"
                onPress={() => setRoomToolsOpen((open) => !open)}
              />
            </View>
            <View style={styles.memberChips}>
              {selectedRoom.kind === 'group' ? (
                <TouchableOpacity
                  style={[
                    styles.memberChip,
                    selectedTargetIds.length === selectedRoom.members.filter((member) => member.enabled).length && styles.memberChipSelected,
                  ]}
                  onPress={selectAllTargets}
                >
                  <Text style={styles.memberChipText}>@all</Text>
                </TouchableOpacity>
              ) : null}
              {selectedRoom.members.map((member) => (
                <TouchableOpacity
                  key={member.connectionId}
                  style={[styles.memberChip, selectedTargetSet.has(member.connectionId) && styles.memberChipSelected]}
                  onPress={() => selectedRoom.kind === 'group' ? toggleTargetSelection(member.connectionId) : insertMention(`@${member.alias}`)}
                >
                  <Text style={[styles.memberChipText, selectedTargetSet.has(member.connectionId) && styles.memberChipTextSelected]}>
                    @{member.alias}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {quickCommandsOpen ? renderQuickCommands() : null}
            {roomToolsOpen ? renderRoomTools() : null}
          </View>
        ) : null}

        <ScrollView
          ref={messageScrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => messageScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!selectedRoom ? (
            <EmptyState
              icon="albums-outline"
              title="还没有可聊天的房间"
              body="先在房间页创建单聊或群聊，再回到这里开始对话。"
              actionLabel="去创建"
              onAction={() => setTab('rooms')}
            />
          ) : null}
          {selectedRoom && selectedMessages.length === 0 ? (
            <EmptyState
              icon="sparkles-outline"
              title="新的对话已经就绪"
              body={selectedRoom.kind === 'group' ? '点一下成员标签插入 @，或使用 @all 让全部 Hermes 回复。' : '输入消息后发送，Laphiny 会保留最近上下文。'}
            />
          ) : null}
          {selectedMessages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.authorId === 'user' && styles.userMessage,
                message.authorId === 'system' && styles.systemMessage,
                isWideLayout && styles.messageBubbleWide,
              ]}
            >
              {message.delegatedFrom ? (
                <View style={styles.delegationBadge}>
                  <Ionicons name="git-branch-outline" size={12} color="#6b7280" />
                  <Text style={styles.delegationText}>↳ {message.delegatedFrom} 委托</Text>
                </View>
              ) : null}
              <View style={styles.messageMeta}>
                <Text style={styles.author}>{message.authorName}</Text>
                <Text style={[styles.status, message.status === 'error' && styles.statusError]}>
                  {getStatusLabel(message.status)} · {formatTime(message.createdAt)}
                  {message.error ? ` · ${message.error}` : ''}
                </Text>
              </View>
              <MarkdownText content={message.content} />
              {message.attachments?.length ? (
                <View style={styles.attachments}>
                  {message.attachments.map((attachment) => (
                    <AttachmentPreview key={attachment.id} attachment={attachment} />
                  ))}
                </View>
              ) : null}
              {message.authorId !== 'user' && message.authorId !== 'system' ? (
                <View style={styles.messageActions}>
                  {message.status === 'running' ? (
                    <MiniButton icon="stop-circle-outline" label="停止" onPress={() => stopMessage(message.id)} />
                  ) : (
                    <MiniButton icon="refresh-outline" label="重试" onPress={() => retryMessage(message)} />
                  )}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          {selectedRoom?.kind === 'group' ? (
            <View style={styles.mentionBar}>
              <Text style={styles.mentionHint}>本次回复</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionList}>
                <TouchableOpacity
                  style={[
                    styles.mentionChip,
                    selectedTargetIds.length === selectedRoom.members.filter((member) => member.enabled).length && styles.mentionChipSelected,
                  ]}
                  onPress={selectAllTargets}
                >
                  <Text style={styles.mentionChipText}>@all</Text>
                </TouchableOpacity>
                {selectedRoom.members.map((member) => (
                  <TouchableOpacity
                    key={member.connectionId}
                    style={[styles.mentionChip, selectedTargetSet.has(member.connectionId) && styles.mentionChipSelected]}
                    onPress={() => toggleTargetSelection(member.connectionId)}
                  >
                    <Text style={[styles.mentionChipText, selectedTargetSet.has(member.connectionId) && styles.mentionChipTextSelected]}>
                      @{member.alias}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {pendingAttachments.length ? (
            <View style={styles.pendingAttachments}>
              {pendingAttachments.map((attachment) => (
                <AttachmentPreview
                  key={attachment.id}
                  attachment={attachment}
                  onPress={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                />
              ))}
            </View>
          ) : null}

          <View style={styles.composerInputRow}>
            <IconButton icon="image-outline" label="添加图片" onPress={attachImages} disabled={!selectedRoom || sending} />
            <IconButton icon="document-attach-outline" label="添加文件" onPress={attachDocuments} disabled={!selectedRoom || sending} />
            <TextInput
              style={styles.composerInput}
              placeholder={selectedRoom?.kind === 'group' ? '@成员名 或 @all 后输入消息' : '输入消息'}
              placeholderTextColor="#9ca3af"
              multiline
              value={draft}
              onChangeText={setDraft}
              textAlignVertical="top"
            />
            <IconButton icon={sending ? 'hourglass-outline' : 'send'} label="发送" onPress={sendMessage} disabled={sending || !selectedRoom} variant="primary" />
          </View>
        </View>
        </View>
      </View>
    );
  }

  function renderRoomRail() {
    return (
      <View style={styles.roomRail}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomRailContent}>
          {rooms.map((room) => (
            <TouchableOpacity
              key={room.id}
              style={[styles.roomPill, room.id === selectedRoomId && styles.roomPillActive]}
              onPress={() => setSelectedRoomId(room.id)}
            >
              <Ionicons
                name={room.kind === 'group' ? 'people-outline' : 'person-outline'}
                size={14}
                color={room.id === selectedRoomId ? '#ffffff' : '#4b5563'}
              />
              <Text style={[styles.roomPillText, room.id === selectedRoomId && styles.roomPillTextActive]}>{room.name}</Text>
              {unreadByRoom[room.id] ? <Text style={styles.roomUnreadBadge}>{unreadByRoom[room.id]}</Text> : null}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.roomCreatePill} onPress={() => setTab('rooms')}>
            <Ionicons name="add" size={16} color="#2563eb" />
            <Text style={styles.roomCreateText}>新房间</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  function renderChatSidebar() {
    return (
      <View style={styles.chatSidebar}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>房间</Text>
          <TouchableOpacity style={styles.sidebarIconButton} onPress={() => setTab('rooms')}>
            <Ionicons name="add" size={18} color="#2563eb" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.sidebarRooms} contentContainerStyle={styles.sidebarRoomsContent}>
          {rooms.length === 0 ? <Text style={styles.help}>还没有房间。</Text> : null}
          {rooms.map((room) => {
            const roomMessages = messagesByRoom[room.id] ?? [];
            const lastMessage = roomMessages[roomMessages.length - 1];
            const active = room.id === selectedRoomId;
            const unread = unreadByRoom[room.id] ?? 0;
            return (
              <TouchableOpacity
                key={room.id}
                style={[styles.sidebarRoom, active && styles.sidebarRoomActive]}
                onPress={() => setSelectedRoomId(room.id)}
              >
                <View style={styles.sidebarRoomTop}>
                  <Text style={[styles.sidebarRoomTitle, active && styles.sidebarRoomTitleActive]}>{room.name}</Text>
                  {unread > 0 ? <Text style={styles.sidebarUnreadBadge}>{unread}</Text> : <Text style={styles.sidebarRoomMeta}>{room.members.length}</Text>}
                </View>
                <Text style={styles.sidebarRoomPreview} numberOfLines={2}>
                  {lastMessage ? `${lastMessage.authorName}: ${lastMessage.content || getStatusLabel(lastMessage.status)}` : '新的房间'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  function renderQuickCommands() {
    if (!selectedRoom) return null;

    return (
      <View style={styles.quickPanel}>
        <Text style={styles.panelLabel}>快捷指令</Text>
        <View style={styles.quickGrid}>
          {QUICK_COMMANDS.map((command) => {
            const targetInRoom = selectedRoom.members.some((member) => (
              member.enabled && member.alias.toLowerCase() === command.targetAlias.toLowerCase()
            ));
            const usable = targetInRoom || selectedRoom.kind === 'direct';
            return (
              <TouchableOpacity
                key={command.id}
                style={[styles.quickCommand, !usable && styles.quickCommandDisabled]}
                onPress={() => runQuickCommand(command)}
                disabled={!usable || sending}
              >
                <Ionicons name={command.icon} size={18} color={usable ? '#2563eb' : '#9ca3af'} />
                <View style={styles.quickCommandTextBlock}>
                  <Text style={[styles.quickCommandTitle, !usable && styles.quickCommandTitleDisabled]}>{command.label}</Text>
                  <Text style={styles.quickCommandTarget}>{usable ? `给 ${command.targetAlias}` : `缺少 ${command.targetAlias}`}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  function renderRoomTools() {
    if (!selectedRoom) return null;
    const messages = messagesByRoom[selectedRoom.id] ?? [];
    const attachmentsCount = messages.reduce((total, message) => total + (message.attachments?.length ?? 0), 0);

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
            <Text style={styles.toolMetricValue}>{selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT}</Text>
            <Text style={styles.toolMetricLabel}>上下文</Text>
          </View>
        </View>

        <View style={styles.contextControl}>
          <Text style={styles.panelLabel}>上下文预算</Text>
          <View style={styles.stepper}>
            <MiniButton icon="remove-outline" label="-4" onPress={() => updateContextLimit(-4)} />
            <MiniButton icon="add-outline" label="+4" onPress={() => updateContextLimit(4)} />
          </View>
        </View>

        <View style={styles.toolActions}>
          <MiniButton icon="download-outline" label="导出 JSON" onPress={() => exportSelectedRoom('json')} />
          <MiniButton icon="document-text-outline" label="导出 MD" onPress={() => exportSelectedRoom('markdown')} />
          <MiniButton icon="refresh-circle-outline" label="清空记忆" onPress={resetRoomSession} />
          <MiniButton icon="trash-outline" label="清空记录" onPress={clearSelectedRoomMessages} />
        </View>
      </View>
    );
  }

  function renderSquare() {
    const events = [...squareEvents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <View style={styles.squareHeader}>
          <View>
            <Text style={styles.sectionTitle}>姐妹广场</Text>
            <Text style={styles.help}>观察 Hermes 回复、系统事件，以及后续从同步后端拉取的协作日志。</Text>
          </View>
          <Text style={styles.squareCount}>{events.length} 条事件</Text>
        </View>

        <View style={styles.syncPanel}>
          <View style={styles.syncHeader}>
            <View>
              <Text style={styles.cardTitle}>SQLite 同步后端</Text>
              <Text style={styles.help}>先按契约连接轻后端，后续设备可以共享房间、消息和广场事件。</Text>
            </View>
            <TouchableOpacity
              style={[styles.syncToggle, syncConfig.enabled && styles.syncToggleOn]}
              onPress={() => setSyncConfig((current) => ({ ...current, enabled: !current.enabled, updatedAt: new Date().toISOString() }))}
            >
              <Text style={[styles.syncToggleText, syncConfig.enabled && styles.syncToggleTextOn]}>
                {syncConfig.enabled ? '已启用' : '未启用'}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={syncConfig.baseUrl}
            onChangeText={(baseUrl) => setSyncConfig((current) => ({ ...current, baseUrl, updatedAt: new Date().toISOString() }))}
            placeholder="https://laper.local/laphiny-sync"
            autoCapitalize="none"
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            value={syncConfig.apiKey}
            onChangeText={(apiKey) => setSyncConfig((current) => ({ ...current, apiKey, updatedAt: new Date().toISOString() }))}
            placeholder="同步 API Key，可留空"
            autoCapitalize="none"
            secureTextEntry
          />
          <View style={styles.syncMetaRow}>
            <Text style={styles.help}>上次拉取：{syncConfig.lastPulledAt ? formatDateTime(syncConfig.lastPulledAt) : '无'}</Text>
            <Text style={styles.help}>上次推送：{syncConfig.lastPushedAt ? formatDateTime(syncConfig.lastPushedAt) : '无'}</Text>
            <Text style={styles.help}>事件轮询：{syncConfig.lastEventPulledAt ? formatDateTime(syncConfig.lastEventPulledAt) : '无'}</Text>
          </View>
          <View style={styles.buttonRow}>
            <SecondaryButton icon="pulse-outline" label={syncing ? '检查中...' : '测试后端'} onPress={testSyncBackend} disabled={syncing} />
            <SecondaryButton icon="cloud-download-outline" label="拉取快照" onPress={pullSyncSnapshot} disabled={syncing} />
            <PrimaryButton icon="cloud-upload-outline" label="推送快照" onPress={pushSyncSnapshot} disabled={syncing} />
          </View>
        </View>

        {events.length === 0 ? (
          <EmptyState
            icon="planet-outline"
            title="广场还没有事件"
            body="当 Hermes 回复、系统提示出现，或同步后端返回协作日志时，这里会形成观察时间线。"
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
            <MarkdownText content={event.body} />
          </View>
        ))}
      </ScrollView>
    );
  }

  function renderRooms() {
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <Text style={styles.sectionTitle}>创建单聊</Text>
        {enabledConnections.length === 0 ? <Text style={styles.muted}>还没有已启用的 Hermes 连接。</Text> : null}
        {enabledConnections.map((connection) => (
          <View key={connection.id} style={styles.rowCard}>
            <View style={styles.rowMain}>
              <Text style={styles.cardTitle}>{connection.name}</Text>
              <Text style={styles.muted}>{connection.baseUrl}</Text>
            </View>
            <SecondaryButton icon="chatbubble-outline" label="单聊" onPress={() => createDirectRoom(connection)} />
          </View>
        ))}

        <Text style={styles.sectionTitle}>创建群聊</Text>
        <TextInput style={styles.input} value={groupName} onChangeText={setGroupName} placeholder="群聊名称" />
        <Text style={styles.help}>群聊会加入全部已启用连接。发送时必须使用 @成员名 或 @all。</Text>
        <PrimaryButton icon="people-outline" label="创建群聊" onPress={createGroupRoom} disabled={enabledConnections.length < 2} />

        <Text style={styles.sectionTitle}>已有房间</Text>
        {rooms.map((room) => (
          <TouchableOpacity key={room.id} style={styles.card} onPress={() => { setSelectedRoomId(room.id); setTab('chat'); }}>
            <Text style={styles.cardTitle}>{room.name}</Text>
            <Text style={styles.muted}>{room.kind === 'group' ? '群聊' : '单聊'} · {room.members.map((member) => member.alias).join('、')}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderConnections() {
    return (
      <ScrollView style={styles.content} contentContainerStyle={styles.panel}>
        <Text style={styles.sectionTitle}>添加 Hermes Gateway</Text>
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
        <PrimaryButton icon="add-circle-outline" label="添加连接" onPress={addConnection} />
        <View style={styles.importSection}>
          <View style={styles.importRow}>
            <SecondaryButton icon="cloud-upload-outline" label="导入 JSON" onPress={importConnections} />
            <SecondaryButton icon="clipboard-outline" label="粘贴导入" onPress={handlePasteImport} disabled={!jsonPaste.trim()} />
          </View>
          <TextInput
            style={[styles.input, styles.jsonPasteInput]}
            multiline
            value={jsonPaste}
            onChangeText={setJsonPaste}
            placeholder={`[\n  { "name": "My Hermes", "baseUrl": "http://...", "apiKey": "..." }\n]`}
            autoCapitalize="none"
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.sectionTitle}>连接列表</Text>
        <View style={styles.healthPanel}>
          <View style={styles.healthPanelHeader}>
            <View>
              <Text style={styles.healthTitle}>连接健康</Text>
              <Text style={styles.help}>延迟、模型列表和最近错误会记录在这里。</Text>
            </View>
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
        </View>
        {connections.length === 0 ? <Text style={styles.muted}>暂无连接。</Text> : null}
        {connections.map((connection) => (
          <View key={connection.id} style={styles.card}>
            <View style={styles.connectionHeader}>
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
              <SecondaryButton icon={connection.enabled ? 'pause-circle-outline' : 'play-circle-outline'} label={connection.enabled ? '停用' : '启用'} onPress={() => toggleConnection(connection.id)} />
              <SecondaryButton
                icon="pulse-outline"
                label={testingConnectionId === connection.id ? '测试中...' : '测试'}
                onPress={() => testConnection(connection)}
                disabled={testingConnectionId === connection.id}
              />
              <SecondaryButton icon="chatbubble-outline" label="单聊" onPress={() => createDirectRoom(connection)} disabled={!connection.enabled} />
            </View>
          </View>
        ))}
      </ScrollView>
    );
  }
}

function buildChatHistory(
  previousMessages: ChatMessage[],
  room: Room,
  member: RoomMember,
  text: string,
  attachments: Attachment[],
  contextLimit = DEFAULT_CONTEXT_LIMIT,
): HermesChatMessage[] {
  const systemPrefix: HermesChatMessage[] = room.kind === 'group'
    ? [{ role: 'system', content: `你正在 Laphiny 群聊「${room.name}」中，你是「${member.alias}」。请只代表自己回复，不要模仿其他成员的语气。` }]
    : [];

  // Per-member context isolation: only include user messages and
  // this member's OWN assistant replies — never other agents' replies.
  const myConnectionId = member.connectionId;
  const history = previousMessages
    .filter((message) => {
      if (message.status !== 'sent') return false;
      if (message.role === 'user') return true;
      if (message.role === 'assistant' && message.authorId === myConnectionId) return true;
      return false;
    })
    .slice(-Math.max(1, contextLimit))
    .map<HermesChatMessage>((message) => ({
      role: message.role,
      content: message.content,
    }));

  return [
    ...systemPrefix,
    ...history,
    {
      role: 'user',
      content: buildHermesUserContent(text, attachments),
    },
  ];
}

function buildChatHistoryForDelegation(
  previousMessages: ChatMessage[],
  room: Room,
  member: RoomMember,
  taskText: string,
  delegatedFrom: string,
  delegatorMessage: string,
): HermesChatMessage[] {
  return [
    {
      role: 'system',
      content: `你正在 Laphiny 群聊「${room.name}」中，${delegatedFrom}判断这个任务更适合你，于是在群里 @ 了你。请只代表自己回复。`,
    },
    ...previousMessages
      .filter((message) => message.status === 'sent' && (message.role === 'user' || message.role === 'assistant'))
      .slice(-20)
      .map<HermesChatMessage>((message) => ({
        role: message.role,
        content: message.content,
      })),
    { role: 'assistant', content: delegatorMessage },
    { role: 'user', content: taskText },
  ];
}

function makeRoom(name: string, kind: Room['kind'], members: RoomMember[]): Room {
  const now = new Date().toISOString();
  const id = makeId('room');
  const sessionIds: Record<string, string> = {};
  const memberSessionKeys: Record<string, string> = {};
  for (const member of members) {
    sessionIds[member.connectionId] = `laphiny-${id}-${member.connectionId}`;
    memberSessionKeys[member.connectionId] = `laphiny-${id}-key`;
  }
  return {
    id,
    name,
    kind,
    members,
    sessionIds,
    sessionKey: `laphiny-${id}`,
    memberSessionKeys,
    contextLimit: DEFAULT_CONTEXT_LIMIT,
    createdAt: now,
    updatedAt: now,
  };
}

function makeAssistantPlaceholder(roomId: string, member: RoomMember): ChatMessage {
  return {
    id: makeId('msg'),
    roomId,
    role: 'assistant',
    authorId: member.connectionId,
    authorName: member.alias,
    content: '正在思考...',
    status: 'running',
    createdAt: new Date().toISOString(),
  };
}

function makeLocalNotice(roomId: string, content: string): ChatMessage {
  return {
    id: makeId('msg'),
    roomId,
    role: 'assistant',
    authorId: 'system',
    authorName: 'Laphiny',
    content,
    status: 'local',
    createdAt: new Date().toISOString(),
  };
}

function TabButton({ icon, label, active, onPress }: { icon: IconName; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Ionicons name={icon} size={16} color={active ? '#ffffff' : '#4b5563'} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PrimaryButton({ icon, label, onPress, disabled = false }: { icon?: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      {icon ? <Ionicons name={icon} size={16} color="#fff" /> : null}
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ icon, label, onPress, disabled = false }: { icon?: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.secondaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      {icon ? <Ionicons name={icon} size={15} color="#2563eb" /> : null}
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function AttachmentPreview({ attachment, onPress }: { attachment: Attachment; onPress?: () => void }) {
  const summary = getAttachmentSummary(attachment);
  const isImage = attachment.kind === 'image' && Boolean(attachment.dataUrl || attachment.uri);
  const content = (
    <>
      {isImage ? (
        <Image source={{ uri: attachment.dataUrl ?? attachment.uri }} style={styles.attachmentThumb} />
      ) : (
        <View style={styles.attachmentIcon}>
          <Ionicons name={attachment.kind === 'text' ? 'document-text-outline' : 'document-outline'} size={18} color="#0f766e" />
        </View>
      )}
      <View style={styles.attachmentInfo}>
        <Text style={styles.attachmentName} numberOfLines={1}>{attachment.name}</Text>
        <Text style={styles.attachmentSummary} numberOfLines={2}>{summary}</Text>
      </View>
      {onPress ? <Ionicons name="close-circle" size={16} color="#0f766e" /> : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.attachmentPreview} onPress={onPress}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.attachmentPreview}>{content}</View>;
}

function HealthMetric({ label, value, tone }: { label: string; value: number; tone: 'ok' | 'error' | 'checking' | 'unknown' }) {
  return (
    <View style={[styles.healthMetric, getHealthMetricStyle(tone)]}>
      <Text style={styles.healthMetricValue}>{value}</Text>
      <Text style={styles.healthMetricLabel}>{label}</Text>
    </View>
  );
}

function HealthBadge({ health }: { health?: ConnectionHealth }) {
  const status = health?.status ?? 'unknown';
  const label = status === 'ok' ? '健康' : status === 'error' ? '异常' : status === 'checking' ? '检查中' : '未知';
  return <Text style={[styles.badge, getHealthBadgeStyle(status)]}>{label}</Text>;
}

function ConnectionHealthDetails({ health }: { health?: ConnectionHealth }) {
  if (!health || health.status === 'unknown') {
    return <Text style={styles.help}>尚未检查。点击“测试”或“刷新全部”获取状态。</Text>;
  }

  if (health.status === 'checking') {
    return (
      <View style={styles.healthDetails}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.help}>正在检查健康状态...</Text>
      </View>
    );
  }

  return (
    <View style={styles.healthDetails}>
      <Text style={styles.healthDetailText}>
        {health.status === 'ok'
          ? `延迟 ${health.latencyMs ?? '-'} ms · 模型 ${health.modelsCount ?? 0} 个`
          : `最近错误：${health.error ?? '未知错误'}`}
      </Text>
      {health.checkedAt ? <Text style={styles.healthCheckedAt}>检查于 {formatDateTime(health.checkedAt)}</Text> : null}
    </View>
  );
}

function MiniButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.miniButton} onPress={onPress}>
      <Ionicons name={icon} size={13} color="#4b5563" />
      <Text style={styles.miniButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  variant = 'ghost',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'ghost' | 'primary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <TouchableOpacity
      accessibilityLabel={label}
      style={[styles.iconButton, isPrimary && styles.iconButtonPrimary, disabled && styles.disabledButton]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color={isPrimary ? '#ffffff' : '#4b5563'} />
    </TouchableOpacity>
  );
}

function MarkdownText({ content }: { content: string }) {
  if (!content) {
    return (
      <View style={styles.streamingLine}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.streamingText}>正在生成...</Text>
      </View>
    );
  }

  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (line.trim().startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push(
        <View key={`code-${index}`} style={styles.markdownCodeBlock}>
          <Text style={styles.markdownCodeText}>{codeLines.join('\n')}</Text>
        </View>,
      );
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (isMarkdownTable(lines, index)) {
      const tableLines: string[] = [];
      tableLines.push(lines[index] ?? '');
      index += 2;
      while (index < lines.length && (lines[index] ?? '').includes('|') && (lines[index] ?? '').trim()) {
        tableLines.push(lines[index] ?? '');
        index += 1;
      }
      blocks.push(<MarkdownTable key={`table-${index}`} lines={tableLines} />);
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      blocks.push(
        <Text key={`heading-${index}`} style={[styles.markdownText, styles.markdownHeading]}>
          {renderInlineMarkdown(headingMatch[2] ?? '')}
        </Text>,
      );
      index += 1;
      continue;
    }

    const listMatch = /^(\s*)([-*]|\d+\.)\s+(.+)$/.exec(line);
    if (listMatch) {
      blocks.push(
        <View key={`list-${index}`} style={styles.markdownListRow}>
          <Text style={styles.markdownBullet}>{listMatch[2]}</Text>
          <Text style={[styles.markdownText, styles.markdownListText]}>{renderInlineMarkdown(listMatch[3] ?? '')}</Text>
        </View>,
      );
      index += 1;
      continue;
    }

    const quoteMatch = /^>\s?(.+)$/.exec(line);
    if (quoteMatch) {
      blocks.push(
        <View key={`quote-${index}`} style={styles.markdownQuote}>
          <Text style={styles.markdownText}>{renderInlineMarkdown(quoteMatch[1] ?? '')}</Text>
        </View>,
      );
      index += 1;
      continue;
    }

    const paragraphLines = [line.trim()];
    index += 1;
    while (
      index < lines.length
      && (lines[index] ?? '').trim()
      && !(lines[index] ?? '').trim().startsWith('```')
      && !/^(#{1,3})\s+/.test(lines[index] ?? '')
      && !/^(\s*)([-*]|\d+\.)\s+/.test(lines[index] ?? '')
      && !/^>\s?/.test(lines[index] ?? '')
      && !isMarkdownTable(lines, index)
    ) {
      paragraphLines.push((lines[index] ?? '').trim());
      index += 1;
    }

    blocks.push(
      <Text key={`p-${index}`} style={styles.markdownText}>
        {renderInlineMarkdown(paragraphLines.join('\n'))}
      </Text>,
    );
  }

  return <View style={styles.markdown}>{blocks}</View>;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines.map((line) => splitTableRow(line));
  return (
    <View style={styles.markdownTable}>
      {rows.map((row, rowIndex) => (
        <View key={`row-${rowIndex}`} style={[styles.markdownTableRow, rowIndex === 0 && styles.markdownTableHeader]}>
          {row.map((cell, cellIndex) => (
            <Text key={`cell-${cellIndex}`} style={styles.markdownTableCell}>
              {renderInlineMarkdown(cell)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color="#2563eb" />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
      {actionLabel && onAction ? <SecondaryButton icon="arrow-forward-outline" label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

function RoomHint({ room }: { room: Room }) {
  return (
    <View style={styles.hint}>
      <Text style={styles.help}>
        {room.kind === 'group'
          ? `群聊成员：${room.members.map((member) => `@${member.alias}`).join('、')}。使用 @all 可全部回复。`
          : `单聊：${room.members[0]?.alias ?? 'Hermes'}`}
      </Text>
    </View>
  );
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'));
}

function findPreviousUserMessageIndex(messages: ChatMessage[], startIndex: number): number {
  for (let index = startIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.authorId === 'user') return index;
  }
  return -1;
}

function getStatusLabel(status: ChatMessage['status']): string {
  return STATUS_LABELS[status] ?? status;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function getSquareEventIcon(kind: SquareEvent['kind']): IconName {
  if (kind === 'system') return 'information-circle-outline';
  if (kind === 'task') return 'checkbox-outline';
  if (kind === 'health') return 'pulse-outline';
  return 'chatbubbles-outline';
}

function mergeByUpdatedAt<T extends { id: string; updatedAt?: string }>(current: T[], incoming: T[] = []): T[] {
  const byId = new Map<string, T>();
  for (const item of current) byId.set(item.id, item);
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      byId.set(item.id, item);
      continue;
    }
    const existingTime = existing.updatedAt ? Date.parse(existing.updatedAt) : 0;
    const incomingTime = item.updatedAt ? Date.parse(item.updatedAt) : 0;
    if (incomingTime >= existingTime) byId.set(item.id, item);
  }
  return Array.from(byId.values()).sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''));
}

function mergeMessagesByRoom(
  current: Record<string, ChatMessage[]>,
  incoming: Record<string, ChatMessage[]> = {},
): Record<string, ChatMessage[]> {
  const merged: Record<string, ChatMessage[]> = { ...current };
  for (const [roomId, messages] of Object.entries(incoming)) {
    const byId = new Map<string, ChatMessage>();
    for (const message of merged[roomId] ?? []) byId.set(message.id, message);
    for (const message of messages) byId.set(message.id, message);
    merged[roomId] = Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return merged;
}

function mergeSquareEvents(events: SquareEvent[]): SquareEvent[] {
  const byId = new Map<string, SquareEvent>();
  for (const event of events) byId.set(event.id, event);
  return Array.from(byId.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function latestSquareEventTime(events: SquareEvent[]): string | undefined {
  return events.map((event) => event.createdAt).sort().at(-1);
}

function getHealthMetricStyle(tone: 'ok' | 'error' | 'checking' | 'unknown') {
  if (tone === 'ok') return styles.healthMetricOk;
  if (tone === 'error') return styles.healthMetricError;
  if (tone === 'checking') return styles.healthMetricChecking;
  return styles.healthMetricUnknown;
}

function getHealthBadgeStyle(status: ConnectionHealth['status']) {
  if (status === 'ok') return styles.healthBadgeOk;
  if (status === 'error') return styles.healthBadgeError;
  if (status === 'checking') return styles.healthBadgeChecking;
  return styles.healthBadgeUnknown;
}

function showNotice(title: string, message?: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

function requestConfirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n${message}`)) onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: '取消', style: 'cancel' },
    { text: '确认', style: 'destructive', onPress: onConfirm },
  ]);
}

function buildMarkdownExport(room: Room, messages: ChatMessage[]): string {
  const lines = [
    `# ${room.name}`,
    '',
    `- 类型：${room.kind === 'group' ? '群聊' : '单聊'}`,
    `- 成员：${room.members.map((member) => member.alias).join('、')}`,
    `- 导出时间：${new Date().toISOString()}`,
    '',
  ];

  for (const message of messages) {
    lines.push(`## ${message.authorName} · ${formatTime(message.createdAt)} · ${getStatusLabel(message.status)}`);
    lines.push('');
    lines.push(message.content || '[空消息]');
    if (message.attachments?.length) {
      lines.push('');
      lines.push('附件：');
      for (const attachment of message.attachments) {
        lines.push(`- ${attachment.name} (${attachment.mimeType})`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

function getAttachmentSummary(attachment: Attachment): string {
  const size = formatBytes(attachment.size);
  if (attachment.kind === 'image') {
    return ['图片上下文', size].filter(Boolean).join(' · ');
  }
  if (attachment.kind === 'text') {
    const chars = attachment.text?.length ?? 0;
    return [`文本上下文 ${chars.toLocaleString('zh-CN')} 字符`, size].filter(Boolean).join(' · ');
  }
  return ['文件引用，不会直接注入上下文', size, attachment.mimeType].filter(Boolean).join(' · ');
}

function formatBytes(size?: number): string {
  if (!size || size <= 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isMarkdownTable(lines: string[], index: number): boolean {
  const current = lines[index] ?? '';
  const next = lines[index + 1] ?? '';
  return current.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index));
    }

    const token = match[0];
    if (token.startsWith('`')) {
      nodes.push(
        <Text key={`code-${match.index}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>,
      );
    } else {
      nodes.push(
        <Text key={`bold-${match.index}`} style={styles.inlineBold}>
          {token.slice(2, -2)}
        </Text>,
      );
    }
    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f5f7fb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  brandBlock: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 4,
    color: '#6b7280',
  },
  headerStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  statPillAccent: {
    borderColor: '#a7f3d0',
    backgroundColor: '#ecfdf5',
  },
  statText: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '800',
  },
  statTextAccent: {
    color: '#065f46',
  },
  unreadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  unreadPillText: {
    color: '#991b1b',
    fontSize: 12,
    fontWeight: '800',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  tabText: {
    color: '#4b5563',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  chatDesktop: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  chatSidebar: {
    width: 280,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  sidebarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sidebarTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  sidebarIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  sidebarRooms: {
    flex: 1,
  },
  sidebarRoomsContent: {
    padding: 8,
    gap: 8,
  },
  sidebarRoom: {
    gap: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  sidebarRoomActive: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  sidebarRoomTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sidebarRoomTitle: {
    flex: 1,
    color: '#111827',
    fontWeight: '800',
  },
  sidebarRoomTitleActive: {
    color: '#1d4ed8',
  },
  sidebarRoomMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  sidebarUnreadBadge: {
    overflow: 'hidden',
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 999,
    color: '#ffffff',
    backgroundColor: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  sidebarRoomPreview: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 17,
  },
  chatMain: {
    flex: 1,
    minWidth: 0,
  },
  panel: {
    padding: 20,
    gap: 12,
  },
  roomRail: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  roomRailContent: {
    alignItems: 'center',
    gap: 8,
  },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  roomPillActive: {
    borderColor: '#111827',
    backgroundColor: '#111827',
  },
  roomPillText: {
    color: '#4b5563',
    fontWeight: '700',
  },
  roomPillTextActive: {
    color: '#fff',
  },
  roomUnreadBadge: {
    overflow: 'hidden',
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    color: '#ffffff',
    backgroundColor: '#dc2626',
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  roomCreatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  roomCreateText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '800',
  },
  chatHeader: {
    marginHorizontal: 20,
    marginBottom: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
    gap: 10,
  },
  roomHeaderActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomTitleBlock: {
    gap: 2,
  },
  roomTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  roomSummary: {
    color: '#6b7280',
    fontSize: 12,
  },
  memberChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  memberChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#f0fdfa',
  },
  memberChipSelected: {
    backgroundColor: '#0f766e',
  },
  memberChipText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
  },
  memberChipTextSelected: {
    color: '#ffffff',
  },
  quickPanel: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  panelLabel: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickCommand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 150,
    flexGrow: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  quickCommandDisabled: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  quickCommandTextBlock: {
    flex: 1,
    gap: 2,
  },
  quickCommandTitle: {
    color: '#1d4ed8',
    fontWeight: '800',
  },
  quickCommandTitleDisabled: {
    color: '#9ca3af',
  },
  quickCommandTarget: {
    color: '#6b7280',
    fontSize: 12,
  },
  toolsPanel: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  toolMetricRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolMetric: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  toolMetricValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  toolMetricLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  contextControl: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  stepper: {
    flexDirection: 'row',
    gap: 8,
  },
  toolActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  squareHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  squareCount: {
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    color: '#2563eb',
    backgroundColor: '#eff6ff',
    fontSize: 12,
    fontWeight: '800',
  },
  syncPanel: {
    gap: 10,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  syncToggle: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
  },
  syncToggleOn: {
    backgroundColor: '#dcfce7',
  },
  syncToggleText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  syncToggleTextOn: {
    color: '#166534',
  },
  syncMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  squareEvent: {
    gap: 8,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  squareEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  squareEventSource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  squareEventTitle: {
    color: '#111827',
    fontWeight: '800',
  },
  squareEventMeta: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messages: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messagesContent: {
    gap: 10,
    paddingBottom: 18,
  },
  messageBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    padding: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  userMessage: {
    alignSelf: 'flex-end',
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  systemMessage: {
    alignSelf: 'center',
    maxWidth: '100%',
    borderColor: '#fde68a',
    backgroundColor: '#fffbeb',
  },
  delegationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f3f4f6',
    alignSelf: 'flex-start',
  },
  delegationText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messageBubbleWide: {
    maxWidth: 760,
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 6,
  },
  author: {
    color: '#111827',
    fontWeight: '800',
  },
  status: {
    flexShrink: 1,
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
  },
  statusError: {
    color: '#b91c1c',
  },
  messageText: {
    color: '#1f2937',
    lineHeight: 22,
  },
  markdown: {
    gap: 8,
  },
  markdownText: {
    color: '#1f2937',
    lineHeight: 22,
  },
  markdownHeading: {
    marginTop: 2,
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  markdownListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  markdownBullet: {
    minWidth: 18,
    color: '#4b5563',
    fontWeight: '800',
    lineHeight: 22,
  },
  markdownListText: {
    flex: 1,
  },
  markdownQuote: {
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#bfdbfe',
  },
  markdownCodeBlock: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#111827',
  },
  markdownCodeText: {
    color: '#e5e7eb',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
  markdownTable: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    overflow: 'hidden',
  },
  markdownTableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  markdownTableHeader: {
    borderTopWidth: 0,
    backgroundColor: '#f9fafb',
  },
  markdownTableCell: {
    flex: 1,
    minWidth: 80,
    paddingHorizontal: 8,
    paddingVertical: 7,
    color: '#1f2937',
    fontSize: 12,
    lineHeight: 18,
  },
  inlineCode: {
    borderRadius: 4,
    backgroundColor: '#eef2ff',
    color: '#3730a3',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  inlineBold: {
    fontWeight: '800',
    color: '#111827',
  },
  streamingLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  streamingText: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  messageActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 10,
    gap: 8,
  },
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  attachmentPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 320,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccfbf1',
    backgroundColor: '#f0fdfa',
  },
  attachmentThumb: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#ccfbf1',
  },
  attachmentIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#ccfbf1',
  },
  attachmentInfo: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  attachmentName: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  attachmentSummary: {
    color: '#0f766e',
    fontSize: 11,
    lineHeight: 15,
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
  },
  attachmentText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  composer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  mentionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mentionHint: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '800',
  },
  mentionList: {
    gap: 6,
  },
  mentionChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#eef2ff',
  },
  mentionChipSelected: {
    backgroundColor: '#3730a3',
  },
  mentionChipText: {
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '800',
  },
  mentionChipTextSelected: {
    color: '#ffffff',
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    color: '#111827',
  },
  importSection: {
    gap: 8,
    marginTop: 4,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  jsonPasteInput: {
    minHeight: 120,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  pendingAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingAttachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f0fdfa',
  },
  pendingAttachmentText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '700',
  },
  composerInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  iconButtonPrimary: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  composerInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 128,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    color: '#111827',
    lineHeight: 20,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#2563eb',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontWeight: '800',
  },
  miniButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  miniButtonText: {
    color: '#4b5563',
    fontSize: 12,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.45,
  },
  sectionTitle: {
    marginTop: 12,
    marginBottom: 4,
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  card: {
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#111827',
    fontWeight: '800',
    fontSize: 16,
  },
  muted: {
    color: '#6b7280',
  },
  help: {
    color: '#6b7280',
    fontSize: 12,
    lineHeight: 18,
  },
  hint: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#fffbeb',
  },
  healthPanel: {
    gap: 12,
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#ffffff',
  },
  healthPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  healthTitle: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '800',
  },
  healthMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  healthMetric: {
    flex: 1,
    minWidth: 86,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  healthMetricOk: {
    borderColor: '#bbf7d0',
    backgroundColor: '#f0fdf4',
  },
  healthMetricError: {
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  healthMetricChecking: {
    borderColor: '#bfdbfe',
    backgroundColor: '#eff6ff',
  },
  healthMetricUnknown: {
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
  },
  healthMetricValue: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  healthMetricLabel: {
    color: '#6b7280',
    fontSize: 12,
    fontWeight: '700',
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  connectionBadges: {
    alignItems: 'flex-end',
    gap: 6,
  },
  badge: {
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
  },
  badgeOn: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  badgeOff: {
    color: '#7f1d1d',
    backgroundColor: '#fee2e2',
  },
  healthBadgeOk: {
    color: '#166534',
    backgroundColor: '#dcfce7',
  },
  healthBadgeError: {
    color: '#991b1b',
    backgroundColor: '#fee2e2',
  },
  healthBadgeChecking: {
    color: '#1d4ed8',
    backgroundColor: '#dbeafe',
  },
  healthBadgeUnknown: {
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
  },
  healthDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
  },
  healthDetailText: {
    color: '#1f2937',
    fontSize: 12,
    fontWeight: '700',
  },
  healthCheckedAt: {
    color: '#6b7280',
    fontSize: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyState: {
    alignItems: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: 440,
    gap: 10,
    paddingVertical: 34,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  emptyTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyBody: {
    color: '#6b7280',
    lineHeight: 20,
    textAlign: 'center',
  },
});
