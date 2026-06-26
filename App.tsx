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
  useWindowDimensions,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';

import { pickDocuments, pickImages } from './src/lib/attachments';
import { HermesClient } from './src/lib/hermes_client';
import { resolveMentionTargets } from './src/lib/mentions';
import { buildHermesUserContent } from './src/lib/payload';
import { loadConnections, loadMessages, loadRooms, saveConnections, saveMessages, saveRooms } from './src/storage/repository';
import { Attachment, ChatMessage, HermesChatMessage, HermesConnection, Room, RoomMember } from './src/types';

type Tab = 'chat' | 'connections' | 'rooms';
type IconName = keyof typeof Ionicons.glyphMap;

const DEFAULT_MODEL = 'hermes-agent';

const DEFAULT_API_KEY = '24a799bdc0ad4c0d73235ee83aae435a2e5b2cae4d7494abb120f7e15a0ba377';

const STATUS_LABELS: Record<ChatMessage['status'], string> = {
  local: '提示',
  queued: '排队',
  running: '思考中',
  sent: '已发送',
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
  const messageScrollRef = useRef<ScrollView | null>(null);
  const { width } = useWindowDimensions();

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
  const isWideLayout = width >= 900;

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

  function insertMention(token: string) {
    setDraft((current) => {
      const spacer = current.length === 0 || /\s$/.test(current) ? '' : ' ';
      return `${current}${spacer}${token} `;
    });
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
        </View>
      </View>

      <View style={styles.tabs}>
        <TabButton icon="chatbubble-ellipses-outline" label="聊天" active={tab === 'chat'} onPress={() => setTab('chat')} />
        <TabButton icon="albums-outline" label="房间" active={tab === 'rooms'} onPress={() => setTab('rooms')} />
        <TabButton icon="git-network-outline" label="连接" active={tab === 'connections'} onPress={() => setTab('connections')} />
      </View>

      {tab === 'chat' ? renderChat() : null}
      {tab === 'rooms' ? renderRooms() : null}
      {tab === 'connections' ? renderConnections() : null}
    </SafeAreaView>
  );

  function renderChat() {
    return (
      <View style={styles.content}>
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
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.roomCreatePill} onPress={() => setTab('rooms')}>
              <Ionicons name="add" size={16} color="#2563eb" />
              <Text style={styles.roomCreateText}>新房间</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {selectedRoom ? (
          <View style={styles.chatHeader}>
            <View style={styles.roomTitleBlock}>
              <Text style={styles.roomTitle}>{selectedRoom.name}</Text>
              <Text style={styles.roomSummary}>
                {selectedRoom.kind === 'group' ? '群聊' : '单聊'} · {selectedRoom.members.length} 位 Hermes
              </Text>
            </View>
            <View style={styles.memberChips}>
              {selectedRoom.kind === 'group' ? (
                <TouchableOpacity style={styles.memberChip} onPress={() => insertMention('@all')}>
                  <Text style={styles.memberChipText}>@all</Text>
                </TouchableOpacity>
              ) : null}
              {selectedRoom.members.map((member) => (
                <TouchableOpacity key={member.connectionId} style={styles.memberChip} onPress={() => insertMention(`@${member.alias}`)}>
                  <Text style={styles.memberChipText}>@{member.alias}</Text>
                </TouchableOpacity>
              ))}
            </View>
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
              <View style={styles.messageMeta}>
                <Text style={styles.author}>{message.authorName}</Text>
                <Text style={[styles.status, message.status === 'error' && styles.statusError]}>
                  {getStatusLabel(message.status)} · {formatTime(message.createdAt)}
                  {message.error ? ` · ${message.error}` : ''}
                </Text>
              </View>
              <Text style={styles.messageText}>{message.content}</Text>
              {message.attachments?.length ? (
                <View style={styles.attachments}>
                  {message.attachments.map((attachment) => (
                    <View key={attachment.id} style={styles.attachment}>
                      <Ionicons name={attachment.kind === 'image' ? 'image-outline' : 'document-text-outline'} size={14} color="#0f766e" />
                      <Text style={styles.attachmentText}>{attachment.name}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.composer}>
          {selectedRoom?.kind === 'group' ? (
            <View style={styles.mentionBar}>
              <Text style={styles.mentionHint}>快速 @</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mentionList}>
                <TouchableOpacity style={styles.mentionChip} onPress={() => insertMention('@all')}>
                  <Text style={styles.mentionChipText}>@all</Text>
                </TouchableOpacity>
                {selectedRoom.members.map((member) => (
                  <TouchableOpacity key={member.connectionId} style={styles.mentionChip} onPress={() => insertMention(`@${member.alias}`)}>
                    <Text style={styles.mentionChipText}>@{member.alias}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {pendingAttachments.length ? (
            <View style={styles.pendingAttachments}>
              {pendingAttachments.map((attachment) => (
                <TouchableOpacity
                  key={attachment.id}
                  style={styles.pendingAttachment}
                  onPress={() => setPendingAttachments((current) => current.filter((item) => item.id !== attachment.id))}
                >
                  <Ionicons name="close-circle" size={14} color="#0f766e" />
                  <Text style={styles.pendingAttachmentText}>{attachment.name}</Text>
                </TouchableOpacity>
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

function getStatusLabel(status: ChatMessage['status']): string {
  return STATUS_LABELS[status] ?? status;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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
  memberChipText: {
    color: '#0f766e',
    fontSize: 12,
    fontWeight: '800',
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
  attachments: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
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
  mentionChipText: {
    color: '#3730a3',
    fontSize: 12,
    fontWeight: '800',
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
