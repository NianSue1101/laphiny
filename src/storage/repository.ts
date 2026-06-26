import { AgentProfileVersion, ChatMessage, CollaborationEvent, DelegationTask, DiagnosticLogEntry, HermesConnection, Room, SquareEvent, SyncConfig, TeamTemplate } from '../types';
import { getDurableJson, migrateSecureStoreValueToDurable, setDurableJson, getJson, setJson } from './kv';

const CONNECTIONS_KEY = 'laphiny.connections.v1';
const ROOMS_KEY = 'laphiny.rooms.v1';
const MESSAGES_KEY = 'laphiny.messages.v1';
const SYNC_CONFIG_KEY = 'laphiny.syncConfig.v1';
const SQUARE_EVENTS_KEY = 'laphiny.squareEvents.v1';
const DIAGNOSTIC_LOGS_KEY = 'laphiny.diagnosticLogs.v1';
const COLLABORATION_EVENTS_KEY = 'laphiny.collaborationEvents.v1';
const DELEGATION_TASKS_KEY = 'laphiny.delegationTasks.v1';
const TEAM_TEMPLATES_KEY = 'laphiny.teamTemplates.v1';
const PROFILE_VERSIONS_KEY = 'laphiny.profileVersions.v1';

const DEFAULT_API_KEY = '24a799bdc0ad4c0d73235ee83aae435a2e5b2cae4d7494abb120f7e15a0ba377';

const DEFAULT_CONNECTIONS: HermesConnection[] = [
  {
    id: makeId('conn'),
    name: 'Flor',
    baseUrl: 'https://nianxxz.site/hermes-api',
    apiKey: DEFAULT_API_KEY,
    model: 'hermes-agent',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: makeId('conn'),
    name: 'Laper',
    baseUrl: 'https://nianxxz.site/laper-api',
    apiKey: DEFAULT_API_KEY,
    model: 'hermes-agent',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: makeId('conn'),
    name: 'Arilphin',
    baseUrl: 'https://nianxxz.site/arilphin-api',
    apiKey: DEFAULT_API_KEY,
    model: 'hermes-agent',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: makeId('conn'),
    name: 'Derux',
    baseUrl: 'https://nianxxz.site/derux-api',
    apiKey: DEFAULT_API_KEY,
    model: 'hermes-agent',
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadConnections(): Promise<HermesConnection[]> {
  const stored = await getJson<HermesConnection[]>(CONNECTIONS_KEY, []);
  if (stored.length > 0) return stored;
  await setJson(CONNECTIONS_KEY, DEFAULT_CONNECTIONS);
  return DEFAULT_CONNECTIONS;
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

export async function loadMessages(): Promise<Record<string, ChatMessage[]>> {
  await migrateSecureStoreValueToDurable(MESSAGES_KEY);
  return getDurableJson<Record<string, ChatMessage[]>>(MESSAGES_KEY, {});
}

export async function saveMessages(messages: Record<string, ChatMessage[]>): Promise<void> {
  await setDurableJson(MESSAGES_KEY, messages);
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
