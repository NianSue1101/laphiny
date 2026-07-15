import { AgentProfileVersion, AppPreferences, ChatMessage, CollaborationEvent, DelegationTask, DiagnosticLogEntry, FeedbackConfig, HermesConnection, Room, SquareEvent, SyncConfig, TeamTemplate } from '../types';
import { getDurableJson, migrateSecureStoreValueToDurable, removeDurableString, setDurableJson, getJson, setJson } from './kv';
import { getChangedMessageTail, getInitialPageStart, getMessageRewriteStart, MESSAGE_INITIAL_PAGE_COUNT, MESSAGE_PAGE_SIZE, splitMessagePages, type MessageHistoryInfo, type MessageRoomPageIndex } from './message_pages';

const CONNECTIONS_KEY = 'laphiny.connections.v1';
const ROOMS_KEY = 'laphiny.rooms.v1';
const MESSAGES_KEY = 'laphiny.messages.v1';
const MESSAGE_PAGES_INDEX_KEY = 'laphiny.messages.pages.v2';
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

type MessagePagesIndex = {
  version: 2;
  rooms: Record<string, MessageRoomPageIndex>;
};

let messageSaveChain: Promise<void> = Promise.resolve();

export async function loadMessages(): Promise<Record<string, ChatMessage[]>> {
  await migrateSecureStoreValueToDurable(MESSAGES_KEY);
  const index = await getDurableJson<MessagePagesIndex | null>(MESSAGE_PAGES_INDEX_KEY, null);
  if (!isMessagePagesIndex(index)) {
    // One-time migration. Later launches only read the last two pages of every room.
    const legacy = await getDurableJson<Record<string, ChatMessage[]>>(MESSAGES_KEY, {});
    await writeAllMessagePages(legacy);
    return Object.fromEntries(Object.entries(legacy).map(([roomId, messages]) => [roomId, messages.slice(-MESSAGE_PAGE_SIZE * MESSAGE_INITIAL_PAGE_COUNT)]));
  }

  const entries = await Promise.all(Object.entries(index.rooms).map(async ([roomId, roomIndex]) => {
    const start = getInitialPageStart(roomIndex.pageCount);
    const pages = await Promise.all(Array.from({ length: roomIndex.pageCount - start }, (_, offset) => (
      getDurableJson<ChatMessage[]>(messagePageKey(roomId, start + offset), [])
    )));
    return [roomId, pages.flat()] as const;
  }));
  return Object.fromEntries(entries);
}

export async function saveMessages(messages: Record<string, ChatMessage[]>): Promise<void> {
  const save = messageSaveChain.then(() => writeChangedMessagePages(messages));
  messageSaveChain = save.catch(() => {});
  await save;
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
  return getDurableJson<ChatMessage[]>(messagePageKey(roomId, pageIndex), []);
}

export async function loadAllMessages(): Promise<Record<string, ChatMessage[]>> {
  await messageSaveChain;
  const index = await ensureMessagePagesIndex();
  const entries = await Promise.all(Object.entries(index.rooms).map(async ([roomId, roomIndex]) => {
    const pages = await Promise.all(Array.from({ length: roomIndex.pageCount }, (_, pageIndex) => (
      getDurableJson<ChatMessage[]>(messagePageKey(roomId, pageIndex), [])
    )));
    return [roomId, pages.flat()] as const;
  }));
  return Object.fromEntries(entries);
}

async function writeAllMessagePages(messagesByRoom: Record<string, ChatMessage[]>): Promise<void> {
  const rooms: Record<string, MessageRoomPageIndex> = {};
  for (const [roomId, messages] of Object.entries(messagesByRoom)) {
    const pages = splitMessagePages(Array.isArray(messages) ? messages : []);
    for (const [pageIndex, page] of pages.entries()) {
      await setDurableJson(messagePageKey(roomId, pageIndex), page);
    }
    rooms[roomId] = { pageCount: pages.length, messageCount: messages.length };
  }
  await setDurableJson(MESSAGE_PAGES_INDEX_KEY, { version: 2, rooms } satisfies MessagePagesIndex);
}

async function writeChangedMessagePages(messagesByRoom: Record<string, ChatMessage[]>): Promise<void> {
  const index = await getDurableJson<MessagePagesIndex | null>(MESSAGE_PAGES_INDEX_KEY, null);
  if (!isMessagePagesIndex(index)) {
    await writeAllMessagePages(messagesByRoom);
    return;
  }

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
      await setDurableJson(messagePageKey(roomId, pageStart + offset), page);
    }
    for (let pageIndex = pageStart + pages.length; pageIndex < previous.pageCount; pageIndex += 1) {
      await removeDurableString(messagePageKey(roomId, pageIndex));
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
  await setDurableJson(MESSAGE_PAGES_INDEX_KEY, { version: 2, rooms } satisfies MessagePagesIndex);
}

function isMessagePagesIndex(value: MessagePagesIndex | null): value is MessagePagesIndex {
  return Boolean(value && value.version === 2 && value.rooms && typeof value.rooms === 'object');
}

async function ensureMessagePagesIndex(): Promise<MessagePagesIndex> {
  let index = await getDurableJson<MessagePagesIndex | null>(MESSAGE_PAGES_INDEX_KEY, null);
  if (isMessagePagesIndex(index)) return index;
  await loadMessages();
  index = await getDurableJson<MessagePagesIndex | null>(MESSAGE_PAGES_INDEX_KEY, null);
  return isMessagePagesIndex(index) ? index : { version: 2, rooms: {} };
}

function messagePageKey(roomId: string, pageIndex: number): string {
  return `laphiny.messages.page.v2.${encodeURIComponent(roomId)}.${pageIndex}`;
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
