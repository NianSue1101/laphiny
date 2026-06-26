import 'react-native-url-polyfill/auto';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { pickDocuments, pickImages } from './src/lib/attachments';
import { HermesClient } from './src/lib/hermes_client';
import { resolveMentionTargets } from './src/lib/mentions';
import { buildHermesUserContent } from './src/lib/payload';
import { loadConnections, loadMessages, loadRooms, saveConnections, saveMessages, saveRooms } from './src/storage/repository';
import { Attachment, ChatMessage, HermesChatMessage, HermesConnection, Room, RoomMember } from './src/types';

type Tab = 'chat' | 'connections' | 'rooms';

const DEFAULT_MODEL = 'hermes-agent';

const DEFAULT_API_KEY = '24a799bdc0ad4c0d73235ee83aae435a2e5b2cae4d7494abb120f7e15a0ba377';

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
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('chat');
  const [draft, setDraft] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [sending, setSending] = useState(false);
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [connectionForm, setConnectionForm] = useState({ name: '', baseUrl: '', apiKey: '', model: DEFAULT_MODEL });
  const [jsonPaste, setJsonPaste] = useState('');
  const [groupName, setGroupName] = useState('Hermes 群聊');
  const hydratedRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    Promise.all([loadConnections(), loadRooms(), loadMessages()])
      .then(([loadedConnections, loadedRooms, loadedMessages]) => {
        if (!mounted) return;
        let finalConnections = loadedConnections;
        if (finalConnections.length === 0) {
          finalConnections = DEFAULT_CONNECTIONS;
          void saveConnections(finalConnections);
        }
        setConnections(finalConnections);
        setRooms(loadedRooms);
        setMessagesByRoom(loadedMessages);
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

  const connectionById = useMemo(() => new Map(connections.map((connection) => [connection.id, connection])), [connections]);
  const enabledConnections = useMemo(() => connections.filter((connection) => connection.enabled), [connections]);
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null;
  const selectedMessages = selectedRoom ? messagesByRoom[selectedRoom.id] ?? [] : [];

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

  function handlePasteImport() {
    const text = jsonPaste.trim();
    if (!text) return;
    importConnectionsFromText(text);
    setJsonPaste('');
  }

  async function testConnection(connection: HermesConnection) {
    setTestingConnectionId(connection.id);
    try {
      const client = new HermesClient(connection);
      const [health, models] = await Promise.all([client.health({ timeoutMs: 8_000 }), client.models({ timeoutMs: 8_000 })]);
      showNotice('连接成功', `状态：${health.status ?? 'ok'}\n模型数：${models.length}`);
    } catch (error) {
      showNotice('连接失败', getErrorMessage(error));
    } finally {
      setTestingConnectionId(null);
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
  }

  function updateMessageInRoom(roomId: string, messageId: string, patch: Partial<ChatMessage>) {
    setMessagesByRoom((current) => ({
      ...current,
      [roomId]: (current[roomId] ?? []).map((message) => (
        message.id === messageId ? { ...message, ...patch } : message
      )),
    }));
  }

  async function sendMessage() {
    if (!selectedRoom) {
      showNotice('请先创建或选择房间');
      return;
    }

    const rawText = draft.trim();
    if (!rawText && pendingAttachments.length === 0) {
      return;
    }

    const resolution = resolveMentionTargets(selectedRoom, rawText);
    const now = new Date().toISOString();
    const textForHermes = resolution.strippedText || rawText;
    const userMessage: ChatMessage = {
      id: makeId('msg'),
      roomId: selectedRoom.id,
      role: 'user',
      authorId: 'user',
      authorName: '你',
      content: rawText || '[附件]',
      attachments: pendingAttachments,
      status: 'sent',
      createdAt: now,
    };

    setDraft('');
    setPendingAttachments([]);
    appendMessagesToRoom(selectedRoom.id, [userMessage]);

    if (resolution.targets.length === 0) {
      const errorText = selectedRoom.kind === 'group'
        ? '群聊消息需要 @成员名 或 @all 才会触发 Hermes 回复。'
        : '这个房间没有可用的 Hermes 成员。';
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, errorText)]);
      return;
    }

    const assistantPlaceholders = resolution.targets.map((member) => makeAssistantPlaceholder(selectedRoom.id, member));
    appendMessagesToRoom(selectedRoom.id, assistantPlaceholders);
    setSending(true);

    await Promise.all(assistantPlaceholders.map(async (placeholder, index) => {
      const member = resolution.targets[index];
      if (!member) return;
      const connection = connectionById.get(member.connectionId);
      if (!connection) {
        updateMessageInRoom(selectedRoom.id, placeholder.id, { status: 'error', error: 'Hermes 连接不存在' });
        return;
      }

      try {
        const client = new HermesClient(connection);
        const response = await client.chatCompletion({
          model: connection.model,
          messages: buildChatHistory(selectedMessages, selectedRoom, member, textForHermes, pendingAttachments),
          stream: false,
        }, {
          sessionId: selectedRoom.sessionIds[connection.id],
          sessionKey: selectedRoom.sessionKey,
          timeoutMs: 120_000,
        });
        const answer = response.choices[0]?.message.content?.trim() || '[Hermes 没有返回内容]';
        updateMessageInRoom(selectedRoom.id, placeholder.id, { content: answer, status: 'sent' });
      } catch (error) {
        updateMessageInRoom(selectedRoom.id, placeholder.id, {
          status: 'error',
          error: getErrorMessage(error),
          content: '发送失败',
        });
      }
    }));

    setSending(false);
  }

  if (!hydrated) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#7c3aed" />
        <Text style={styles.muted}>正在加载 Laphiny...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Laphiny</Text>
          <Text style={styles.subtitle}>多 Hermes 群聊 · @ 控制回复 · 图片/文件上下文</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton label="聊天" active={tab === 'chat'} onPress={() => setTab('chat')} />
        <TabButton label="房间" active={tab === 'rooms'} onPress={() => setTab('rooms')} />
        <TabButton label="连接" active={tab === 'connections'} onPress={() => setTab('connections')} />
      </View>

      {tab === 'chat' ? renderChat() : null}
      {tab === 'rooms' ? renderRooms() : null}
      {tab === 'connections' ? renderConnections() : null}
    </SafeAreaView>
  );

  function renderChat() {
    return (
      <View style={styles.content}>
        <View style={styles.roomStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {rooms.length === 0 ? <Text style={styles.muted}>先添加连接并创建房间</Text> : null}
            {rooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={[styles.roomPill, room.id === selectedRoomId && styles.roomPillActive]}
                onPress={() => setSelectedRoomId(room.id)}
              >
                <Text style={[styles.roomPillText, room.id === selectedRoomId && styles.roomPillTextActive]}>{room.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView style={styles.messages} contentContainerStyle={styles.messagesContent}>
          {selectedRoom ? <RoomHint room={selectedRoom} /> : null}
          {selectedMessages.map((message) => (
            <View key={message.id} style={[styles.messageCard, message.authorId === 'user' && styles.userMessage]}>
              <View style={styles.messageMeta}>
                <Text style={styles.author}>{message.authorName}</Text>
                <Text style={styles.status}>{message.status}{message.error ? ` · ${message.error}` : ''}</Text>
              </View>
              <Text style={styles.messageText}>{message.content}</Text>
              {message.attachments?.length ? (
                <View style={styles.attachments}>
                  {message.attachments.map((attachment) => (
                    <Text key={attachment.id} style={styles.attachment}>📎 {attachment.name}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          {pendingAttachments.length ? (
            <View style={styles.pendingAttachments}>
              {pendingAttachments.map((attachment) => (
                <TouchableOpacity
                  key={attachment.id}
                  style={styles.pendingAttachment}
                  onPress={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                >
                  <Text style={styles.pendingAttachmentText}>{attachment.name} ×</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder={selectedRoom?.kind === 'group' ? '@成员名 或 @all 后输入消息' : '输入消息'}
            multiline
            value={draft}
            onChangeText={setDraft}
          />

          <View style={styles.composerActions}>
            <SecondaryButton label="图片" onPress={attachImages} />
            <SecondaryButton label="文件" onPress={attachDocuments} />
            <PrimaryButton label={sending ? '发送中...' : '发送'} onPress={sendMessage} disabled={sending || !selectedRoom} />
          </View>
        </View>
      </View>
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
            <SecondaryButton label="单聊" onPress={() => createDirectRoom(connection)} />
          </View>
        ))}

        <Text style={styles.sectionTitle}>创建群聊</Text>
        <TextInput style={styles.input} value={groupName} onChangeText={setGroupName} placeholder="群聊名称" />
        <Text style={styles.help}>群聊会加入全部已启用连接。发送时必须使用 @成员名 或 @all。</Text>
        <PrimaryButton label="创建群聊" onPress={createGroupRoom} disabled={enabledConnections.length < 2} />

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
          placeholder="名称，例如 猫娘"
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
        <PrimaryButton label="添加连接" onPress={addConnection} />
        <View style={styles.importRow}>
          <SecondaryButton label="导入 JSON" onPress={importConnections} />
          <TextInput
            style={[styles.input, styles.importTextInput]}
            multiline
            value={jsonPaste}
            onChangeText={setJsonPaste}
            placeholder={`[\n  { "name": "My Hermes", "baseUrl": "http://...", "apiKey": "..." }\n]`}
            autoCapitalize="none"
            textAlignVertical="top"
          />
          <SecondaryButton label="粘贴导入" onPress={handlePasteImport} disabled={!jsonPaste.trim()} />
        </View>

        <Text style={styles.sectionTitle}>连接列表</Text>
        {connections.length === 0 ? <Text style={styles.muted}>暂无连接。</Text> : null}
        {connections.map((connection) => (
          <View key={connection.id} style={styles.card}>
            <View style={styles.connectionHeader}>
              <View style={styles.rowMain}>
                <Text style={styles.cardTitle}>{connection.name}</Text>
                <Text style={styles.muted}>{connection.baseUrl}</Text>
                <Text style={styles.help}>模型：{connection.model}</Text>
              </View>
              <Text style={[styles.badge, connection.enabled ? styles.badgeOn : styles.badgeOff]}>
                {connection.enabled ? '启用' : '停用'}
              </Text>
            </View>
            <View style={styles.buttonRow}>
              <SecondaryButton label={connection.enabled ? '停用' : '启用'} onPress={() => toggleConnection(connection.id)} />
              <SecondaryButton
                label={testingConnectionId === connection.id ? '测试中...' : '测试'}
                onPress={() => testConnection(connection)}
                disabled={testingConnectionId === connection.id}
              />
              <SecondaryButton label="单聊" onPress={() => createDirectRoom(connection)} disabled={!connection.enabled} />
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
): HermesChatMessage[] {
  const systemPrefix: HermesChatMessage[] = room.kind === 'group'
    ? [{ role: 'system', content: `你正在 Laphiny 群聊「${room.name}」中，当前被 @ 的 Hermes 成员名是「${member.alias}」。请只代表自己回复。` }]
    : [];

  const history = previousMessages
    .filter((message) => message.status === 'sent' && (message.role === 'user' || message.role === 'assistant'))
    .slice(-20)
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

function makeRoom(name: string, kind: Room['kind'], members: RoomMember[]): Room {
  const now = new Date().toISOString();
  const id = makeId('room');
  return {
    id,
    name,
    kind,
    members,
    sessionIds: {},
    sessionKey: `laphiny-${id}`,
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

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.tab, active && styles.tabActive]} onPress={onPress}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function PrimaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.primaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SecondaryButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[styles.secondaryButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </TouchableOpacity>
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

function showNotice(title: string, message?: string) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: '#f8efe4',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#f8efe4',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#271a38',
  },
  subtitle: {
    marginTop: 4,
    color: '#6b5f73',
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fffaf4',
  },
  tabActive: {
    backgroundColor: '#7c3aed',
  },
  tabText: {
    color: '#5f5270',
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  panel: {
    padding: 20,
    gap: 12,
  },
  roomStrip: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  roomPill: {
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fffaf4',
  },
  roomPillActive: {
    backgroundColor: '#271a38',
  },
  roomPillText: {
    color: '#5f5270',
    fontWeight: '700',
  },
  roomPillTextActive: {
    color: '#fff',
  },
  messages: {
    flex: 1,
    paddingHorizontal: 20,
  },
  messagesContent: {
    gap: 10,
    paddingBottom: 16,
  },
  messageCard: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fffaf4',
    borderWidth: 1,
    borderColor: '#eadccc',
  },
  userMessage: {
    backgroundColor: '#efe7ff',
    borderColor: '#d8c8ff',
  },
  messageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  author: {
    color: '#271a38',
    fontWeight: '800',
  },
  status: {
    flexShrink: 1,
    color: '#8d7d99',
    fontSize: 12,
  },
  messageText: {
    color: '#271a38',
    lineHeight: 21,
  },
  attachments: {
    marginTop: 8,
    gap: 4,
  },
  attachment: {
    color: '#6d28d9',
    fontSize: 12,
  },
  composer: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#eadccc',
    backgroundColor: '#f8efe4',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 13,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d8caba',
    backgroundColor: '#fffaf4',
    color: '#271a38',
  },
  jsonPasteInput: {
    minHeight: 80,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  importRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  importTextInput: {
    flex: 1,
    minHeight: 44,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
  },
  pendingAttachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pendingAttachment: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#ede9fe',
  },
  pendingAttachmentText: {
    color: '#5b21b6',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#7c3aed',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#cbb7e8',
    backgroundColor: '#fffaf4',
  },
  secondaryButtonText: {
    color: '#5b21b6',
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
    color: '#271a38',
  },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fffaf4',
    borderWidth: 1,
    borderColor: '#eadccc',
    gap: 10,
  },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#fffaf4',
    borderWidth: 1,
    borderColor: '#eadccc',
  },
  rowMain: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    color: '#271a38',
    fontWeight: '800',
    fontSize: 16,
  },
  muted: {
    color: '#7b6d85',
  },
  help: {
    color: '#7b6d85',
    fontSize: 12,
    lineHeight: 18,
  },
  hint: {
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#fff6d7',
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
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
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
