import { AgentProfileVersion, AppPreferences, ChatMessage, CollaborationEvent, DelegationTask, DiagnosticLogEntry, FeedbackConfig, HermesConnection, Room, SquareEvent, SyncConfig, TeamTemplate } from '../types';
import { buildMessageSearchDocuments, findMessageSearchDocumentIds, type MessageSearchDocument } from '../lib/message_search';
import { normalizeInterruptedChatMessages } from '../lib/stream_events';
import { getDurableJson, getDurableString, migrateSecureStoreValueToDurable, removeDurableString, setDurableJson, getJson, setJson } from './kv';
import { decideMessageIndexRecovery, getChangedMessageTail, getInitialPageStart, getMessageRewriteStart, isMessagePagesIndex, MESSAGE_INITIAL_PAGE_COUNT, MESSAGE_PAGE_SIZE, splitMessagePages, type MessageHistoryInfo, type MessagePagesIndex, type MessageRoomPageIndex } from './message_pages';

const CONNECTIONS_KEY = 'laphiny.connections.v1';
const ROOMS_KEY = 'laphiny.rooms.v1';
const MESSAGES_KEY = 'laphiny.messages.v1';
const MESSAGE_PAGES_INDEX_KEY = 'laphiny.messages.pages.v2';
const MESSAGE_PAGES_INDEX_BACKUP_KEY = 'laphiny.messages.pages.backup.v2';
const SYNC_CONFIG_KEY = 'laphiny.syncConfig.v1';
const SQUARE_EVENTS_KEY = 'laphiny.squareEvents.v1';
const DIAGNOSTIC_LOGS_KEY = 'laphiny.diagnosticLogs.v1';
const COLLABORATION_EVENTS_KEY = 'laphiny.collaborationEvents.v1';
const DELEGATION_TASKS_KEY = 'laphiny.delegationTasks.v1';
const TEAM_TEMPLATES_KEY = 'laphiny.teamTemplates.v1';
const PROFILE_VERSIONS_KEY = 'laphiny.profileVersions.v1';
const APP_PREFERENCES_KEY = 'laphiny.appPreferences.v1';
const FEEDBACK_CONFIG_KEY = 'laphiny.feedbackConfig.v1';

export async function loadConnections(): Promise<HermesConnection[]> {
  return getJson<HermesConnection[]>(CONNECTIONS_KEY, []);
}

export async function saveConnections(connections: HermesConnection[]): Promise<void> {
  await setJson(CONNECTIONS_KEY, connections);
}

export async function loadRooms(): Promise<Room[]> {
  await migrateSecureStoreValueToDurable(ROOMS_KEY);
  return getDurableJson<Room[]>(ROOMS_KEY, []);
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  await setDurableJson(ROOMS_KEY, rooms);
}

let messageSaveChain: Promise<void> = Promise.resolve();

export class MessageHistoryStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageHistoryStorageError';
  }
}

export async function loadMessages(): Promise<Record<string, ChatMessage[]>> {
  await migrateSecureStoreValueToDurable(MESSAGES_KEY);
  const index = await ensureMessagePagesIndex();
  const now = new Date().toISOString();

  const entries = await Promise.all(Object.entries(index.rooms).map(async ([roomId, roomIndex]) => {
    const start = getInitialPageStart(roomIndex.pageCount);
    const pages = await Promise.all(Array.from({ length: roomIndex.pageCount - start }, (_, offset) => (
      readMessagePage(roomId, start + offset)
    )));
    const flat = normalizeInterruptedChatMessages(pages.flat(), now);
    const trimmed = flat.length > MESSAGE_PAGE_SIZE * MESSAGE_INITIAL_PAGE_COUNT
      ? flat.slice(-MESSAGE_PAGE_SIZE * MESSAGE_INITIAL_PAGE_COUNT)
      : flat;
    return [roomId, trimmed] as const;
  }));
  return Object.fromEntries(entries);
}

export async function saveMessages(messages: Record<string, ChatMessage[]>): Promise<void> {
  const save = messageSaveChain.then(() => writeChangedMessagePages(messages));
  messageSaveChain = save.catch(() => {});
  await save;
}

/** Permanently removes every paged message and search document for one room. */
export async function removeMessageHistoryRoom(roomId: string): Promise<void> {
  const remove = messageSaveChain.then(async () => {
    const index = await ensureMessagePagesIndex();
    const roomIndex = index.rooms[roomId];
    if (!roomIndex) return;

    for (let pageIndex = 0; pageIndex < roomIndex.pageCount; pageIndex += 1) {
      await removeDurableString(messagePageKey(roomId, pageIndex));
      await removeDurableString(messageSearchPageKey(roomId, pageIndex));
    }
    const rooms = { ...index.rooms };
    delete rooms[roomId];
    await persistMessagePagesIndex({ version: 2, rooms });
  });
  messageSaveChain = remove.catch(() => {});
  await remove;
}

export async function loadMessageHistoryInfo(): Promise<Record<string, MessageHistoryInfo>> {
  await messageSaveChain;
  const index = await ensureMessagePagesIndex();
  return Object.fromEntries(Object.entries(index.rooms).map(([roomId, roomIndex]) => {
    const initialStart = getInitialPageStart(roomIndex.pageCount);
    return [roomId, {
      totalCount: roomIndex.messageCount,
      nextOlderPage: initialStart - 1,
    } satisfies MessageHistoryInfo];
  }));
}

export async function loadMessagePage(roomId: string, pageIndex: number): Promise<ChatMessage[]> {
  if (pageIndex < 0) return [];
  await messageSaveChain;
  const index = await ensureMessagePagesIndex();
  const roomIndex = index.rooms[roomId];
  if (!roomIndex || pageIndex >= roomIndex.pageCount) return [];
  return readMessagePage(roomId, pageIndex);
}

export async function loadAllMessages(): Promise<Record<string, ChatMessage[]>> {
  await messageSaveChain;
  const index = await ensureMessagePagesIndex();
  const entries = await Promise.all(Object.entries(index.rooms).map(async ([roomId, roomIndex]) => {
    const pages = await Promise.all(Array.from({ length: roomIndex.pageCount }, (_, pageIndex) => (
      readMessagePage(roomId, pageIndex)
    )));
    return [roomId, pages.flat()] as const;
  }));
  return Object.fromEntries(entries);
}

export async function searchMessages(rawQuery: string, limit = 50): Promise<Record<string, ChatMessage[]>> {
  const query = rawQuery.trim();
  if (!query || limit <= 0) return {};
  await messageSaveChain;
  const index = await ensureMessagePagesIndex();
  const matches: ChatMessage[] = [];

  for (const [roomId, roomIndex] of Object.entries(index.rooms)) {
    for (let pageIndex = roomIndex.pageCount - 1; pageIndex >= 0; pageIndex -= 1) {
      const documents = await loadOrBuildSearchDocuments(roomId, pageIndex);
      const matchingIds = new Set(findMessageSearchDocumentIds(documents, query, limit));
      if (matchingIds.size === 0) continue;
      const page = await readMessagePage(roomId, pageIndex);
      matches.push(...page.filter((message) => matchingIds.has(message.id)));
    }
  }

  const result: Record<string, ChatMessage[]> = {};
  for (const message of matches
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, limit)) {
    (result[message.roomId] ??= []).push(message);
  }
  return result;
}

async function writeAllMessagePages(messagesByRoom: Record<string, ChatMessage[]>): Promise<void> {
  const rooms: Record<string, MessageRoomPageIndex> = {};
  for (const [roomId, messages] of Object.entries(messagesByRoom)) {
    const pages = splitMessagePages(Array.isArray(messages) ? messages : []);
    for (const [pageIndex, page] of pages.entries()) {
      await writeMessagePage(roomId, pageIndex, page);
    }
    rooms[roomId] = { pageCount: pages.length, messageCount: messages.length };
  }
  await persistMessagePagesIndex({ version: 2, rooms });
}

async function writeChangedMessagePages(messagesByRoom: Record<string, ChatMessage[]>): Promise<void> {
  const index = await ensureMessagePagesIndex();

  const rooms = { ...index.rooms };
  for (const [roomId, rawMessages] of Object.entries(messagesByRoom)) {
    const current = Array.isArray(rawMessages) ? rawMessages : [];
    const previous = rooms[roomId] ?? { pageCount: 0, messageCount: 0 };
    const previousStart = getInitialPageStart(previous.pageCount);
    const storedTail = (await Promise.all(Array.from({ length: previous.pageCount - previousStart }, (_, offset) => (
      getDurableJson<ChatMessage[]>(messagePageKey(roomId, previousStart + offset), [])
    )))).flat();
    const changedTail = getChangedMessageTail(current, storedTail);
    if (changedTail === null) continue;

    const pageStart = getMessageRewriteStart(current, previousStart);
    const pages = splitMessagePages(changedTail);
    for (const [offset, page] of pages.entries()) {
      await writeMessagePage(roomId, pageStart + offset, page);
    }
    for (let pageIndex = pageStart + pages.length; pageIndex < previous.pageCount; pageIndex += 1) {
      await removeDurableString(messagePageKey(roomId, pageIndex));
      await removeDurableString(messageSearchPageKey(roomId, pageIndex));
    }

    if (current.length === 0) {
      rooms[roomId] = { pageCount: 0, messageCount: 0 };
    } else {
      const leadingCount = Math.max(0, previous.messageCount - storedTail.length);
      rooms[roomId] = {
        pageCount: pageStart + pages.length,
        messageCount: leadingCount + changedTail.length,
      };
    }
  }
  await persistMessagePagesIndex({ version: 2, rooms });
}

async function ensureMessagePagesIndex(): Promise<MessagePagesIndex> {
  const primaryRaw = await getDurableString(MESSAGE_PAGES_INDEX_KEY);
  const primary = parseJsonValue(primaryRaw);
  const backupRaw = await getDurableString(MESSAGE_PAGES_INDEX_BACKUP_KEY);
  const backup = parseJsonValue(backupRaw);
  const legacyRaw = await getDurableString(MESSAGES_KEY);
  const legacy = parseJsonValue(legacyRaw);
  const decision = decideMessageIndexRecovery({
    primary,
    backup,
    legacy,
    primaryExists: primaryRaw !== null,
    legacyExists: legacyRaw !== null,
  });

  if (decision.source === 'primary') {
    if (!isMessagePagesIndex(backup)) await setDurableJson(MESSAGE_PAGES_INDEX_BACKUP_KEY, decision.index);
    return decision.index;
  }
  if (decision.source === 'backup') {
    await setDurableJson(MESSAGE_PAGES_INDEX_KEY, decision.index);
    return decision.index;
  }
  if (decision.source === 'legacy') {
    await writeAllMessagePages(decision.messages);
    return (await readMessagePagesIndex()) ?? { version: 2, rooms: {} };
  }
  if (decision.source === 'empty') {
    await persistMessagePagesIndex(decision.index);
    return decision.index;
  }

  throw new MessageHistoryStorageError('消息分页索引损坏，且没有可用的备份索引；原始分页文件未被删除。');
}

function messagePageKey(roomId: string, pageIndex: number): string {
  return `laphiny.messages.page.v2.${encodeURIComponent(roomId)}.${pageIndex}`;
}

function messageSearchPageKey(roomId: string, pageIndex: number): string {
  return `laphiny.messages.search.v1.${encodeURIComponent(roomId)}.${pageIndex}`;
}

async function writeMessagePage(roomId: string, pageIndex: number, page: ChatMessage[]): Promise<void> {
  await setDurableJson(messagePageKey(roomId, pageIndex), page);
  await setDurableJson(messageSearchPageKey(roomId, pageIndex), buildMessageSearchDocuments(roomId, page));
}

async function readMessagePage(roomId: string, pageIndex: number): Promise<ChatMessage[]> {
  const raw = await getDurableString(messagePageKey(roomId, pageIndex));
  const parsed = parseJsonValue(raw);
  if (!Array.isArray(parsed)) {
    throw new MessageHistoryStorageError(`房间 ${roomId} 的消息分页 ${pageIndex} 缺失或损坏。`);
  }
  return parsed as ChatMessage[];
}

async function loadOrBuildSearchDocuments(roomId: string, pageIndex: number): Promise<MessageSearchDocument[]> {
  const raw = await getDurableString(messageSearchPageKey(roomId, pageIndex));
  const parsed = parseJsonValue(raw);
  if (isMessageSearchDocuments(parsed)) return parsed;
  const page = await readMessagePage(roomId, pageIndex);
  const documents = buildMessageSearchDocuments(roomId, page);
  await setDurableJson(messageSearchPageKey(roomId, pageIndex), documents);
  return documents;
}

async function persistMessagePagesIndex(index: MessagePagesIndex): Promise<void> {
  await setDurableJson(MESSAGE_PAGES_INDEX_BACKUP_KEY, index);
  await setDurableJson(MESSAGE_PAGES_INDEX_KEY, index);
}

async function readMessagePagesIndex(): Promise<MessagePagesIndex | null> {
  const parsed = parseJsonValue(await getDurableString(MESSAGE_PAGES_INDEX_KEY));
  return isMessagePagesIndex(parsed) ? parsed : null;
}

function parseJsonValue(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function isMessageSearchDocuments(value: unknown): value is MessageSearchDocument[] {
  return Array.isArray(value) && value.every((document) => Boolean(
    document
    && typeof document === 'object'
    && typeof (document as MessageSearchDocument).messageId === 'string'
    && typeof (document as MessageSearchDocument).normalizedText === 'string',
  ));
}

export async function loadSyncConfig(): Promise<SyncConfig> {
  return getJson<SyncConfig>(SYNC_CONFIG_KEY, {
    enabled: false,
    baseUrl: '',
    apiKey: '',
    updatedAt: new Date().toISOString(),
  });
}

export async function saveSyncConfig(config: SyncConfig): Promise<void> {
  await setJson(SYNC_CONFIG_KEY, config);
}

export async function loadSquareEvents(): Promise<SquareEvent[]> {
  await migrateSecureStoreValueToDurable(SQUARE_EVENTS_KEY);
  return getDurableJson<SquareEvent[]>(SQUARE_EVENTS_KEY, []);
}

export async function saveSquareEvents(events: SquareEvent[]): Promise<void> {
  await setDurableJson(SQUARE_EVENTS_KEY, events);
}


export async function loadDiagnosticLogs(): Promise<DiagnosticLogEntry[]> {
  await migrateSecureStoreValueToDurable(DIAGNOSTIC_LOGS_KEY);
  return getDurableJson<DiagnosticLogEntry[]>(DIAGNOSTIC_LOGS_KEY, []);
}

export async function saveDiagnosticLogs(logs: DiagnosticLogEntry[]): Promise<void> {
  await setDurableJson(DIAGNOSTIC_LOGS_KEY, logs);
}


export async function loadCollaborationEvents(): Promise<CollaborationEvent[]> {
  await migrateSecureStoreValueToDurable(COLLABORATION_EVENTS_KEY);
  return getDurableJson<CollaborationEvent[]>(COLLABORATION_EVENTS_KEY, []);
}

export async function saveCollaborationEvents(events: CollaborationEvent[]): Promise<void> {
  await setDurableJson(COLLABORATION_EVENTS_KEY, events);
}

export async function loadDelegationTasks(): Promise<DelegationTask[]> {
  await migrateSecureStoreValueToDurable(DELEGATION_TASKS_KEY);
  return getDurableJson<DelegationTask[]>(DELEGATION_TASKS_KEY, []);
}

export async function saveDelegationTasks(tasks: DelegationTask[]): Promise<void> {
  await setDurableJson(DELEGATION_TASKS_KEY, tasks);
}

export async function loadTeamTemplates(): Promise<TeamTemplate[]> {
  await migrateSecureStoreValueToDurable(TEAM_TEMPLATES_KEY);
  return getDurableJson<TeamTemplate[]>(TEAM_TEMPLATES_KEY, []);
}

export async function saveTeamTemplates(templates: TeamTemplate[]): Promise<void> {
  await setDurableJson(TEAM_TEMPLATES_KEY, templates);
}

export async function loadProfileVersions(): Promise<AgentProfileVersion[]> {
  await migrateSecureStoreValueToDurable(PROFILE_VERSIONS_KEY);
  return getDurableJson<AgentProfileVersion[]>(PROFILE_VERSIONS_KEY, []);
}

export async function saveProfileVersions(versions: AgentProfileVersion[]): Promise<void> {
  await setDurableJson(PROFILE_VERSIONS_KEY, versions);
}

export async function loadAppPreferences(): Promise<AppPreferences> {
  return getJson<AppPreferences>(APP_PREFERENCES_KEY, {
    themeMode: 'light',
    fontFamily: 'system',
    showReasoning: false,
    showMessageDate: false,
    updatedAt: new Date().toISOString(),
  });
}

export async function saveAppPreferences(preferences: AppPreferences): Promise<void> {
  await setJson(APP_PREFERENCES_KEY, preferences);
}

export async function loadFeedbackConfig(): Promise<FeedbackConfig> {
  const fallback: FeedbackConfig = {
    enabled: true,
    baseUrl: '/laphiny-feedback',
    apiKey: '',
    updatedAt: new Date().toISOString(),
  };
  const config = await getJson<FeedbackConfig>(FEEDBACK_CONFIG_KEY, fallback);
  return {
    ...config,
    enabled: config.enabled ?? true,
    baseUrl: config.baseUrl?.trim() ? config.baseUrl : fallback.baseUrl,
  };
}

export async function saveFeedbackConfig(config: FeedbackConfig): Promise<void> {
  await setJson(FEEDBACK_CONFIG_KEY, config);
}
