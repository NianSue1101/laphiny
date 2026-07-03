import type {
  AgentProfileVersion,
  ChatMessage,
  CollaborationEvent,
  DelegationTask,
  DiagnosticLogEntry,
  HermesConnection,
  Room,
  SquareEvent,
  SyncConfig,
  SyncSnapshot,
  TeamTemplate,
} from '../types';
import { sanitizeDiagnosticLogs } from './diagnostics';

export type LaphinyBackup = SyncSnapshot & {
  version: 5;
  exportedAt: string;
  syncConfig: SyncConfig;
  diagnosticLogs: DiagnosticLogEntry[];
};

export type RestoredBackup = SyncSnapshot & {
  syncConfig?: SyncConfig;
  diagnosticLogs?: DiagnosticLogEntry[];
};

export interface SyncSnapshotCollections {
  connections: HermesConnection[];
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  squareEvents: SquareEvent[];
  collaborationEvents: CollaborationEvent[];
  delegationTasks: DelegationTask[];
  teamTemplates: TeamTemplate[];
  profileVersions: AgentProfileVersion[];
}

export function buildSyncSnapshot(collections: SyncSnapshotCollections, now = new Date().toISOString()): SyncSnapshot {
  return {
    ...collections,
    updatedAt: now,
  };
}

export function buildAppBackup(
  collections: SyncSnapshotCollections,
  syncConfig: SyncConfig,
  diagnosticLogs: DiagnosticLogEntry[],
  now = new Date().toISOString(),
): LaphinyBackup {
  return {
    version: 5,
    exportedAt: now,
    ...buildSyncSnapshot(collections, now),
    syncConfig,
    diagnosticLogs,
  };
}

export function normalizeBackupSnapshot(value: unknown): RestoredBackup | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<SyncSnapshot>;
  if (!Array.isArray(raw.connections) || !Array.isArray(raw.rooms) || !raw.messagesByRoom || typeof raw.messagesByRoom !== 'object') {
    return null;
  }

  const rawRecord = value as Record<string, unknown>;
  const syncConfig = rawRecord.syncConfig && typeof rawRecord.syncConfig === 'object'
    ? rawRecord.syncConfig as SyncConfig
    : undefined;

  return {
    connections: raw.connections,
    rooms: raw.rooms,
    messagesByRoom: raw.messagesByRoom as Record<string, ChatMessage[]>,
    squareEvents: Array.isArray(raw.squareEvents) ? raw.squareEvents : [],
    collaborationEvents: Array.isArray(rawRecord.collaborationEvents) ? rawRecord.collaborationEvents as CollaborationEvent[] : [],
    delegationTasks: Array.isArray(rawRecord.delegationTasks) ? rawRecord.delegationTasks as DelegationTask[] : [],
    teamTemplates: Array.isArray(rawRecord.teamTemplates) ? rawRecord.teamTemplates as TeamTemplate[] : [],
    profileVersions: Array.isArray(rawRecord.profileVersions) ? rawRecord.profileVersions as AgentProfileVersion[] : [],
    diagnosticLogs: sanitizeDiagnosticLogs(rawRecord.diagnosticLogs),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
    syncConfig,
  };
}
