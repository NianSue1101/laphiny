import type { ChatMessage, HermesConnection, Room, SquareEvent, SyncSnapshot } from '../types';

export type SyncConflictEntity = 'connection' | 'room' | 'message' | 'squareEvent';
export type SyncConflictStatus = 'local-only' | 'remote-only' | 'local-newer' | 'remote-newer' | 'same-time-different';

export interface SyncConflictItem {
  id: string;
  entity: SyncConflictEntity;
  label: string;
  status: SyncConflictStatus;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  detail?: string;
}

export interface SyncConflictSummary {
  localOnly: number;
  remoteOnly: number;
  localNewer: number;
  remoteNewer: number;
  sameTimeDifferent: number;
  total: number;
}

export interface SyncConflictReport {
  checkedAt: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  summary: SyncConflictSummary;
  items: SyncConflictItem[];
  truncated: boolean;
}

const MAX_CONFLICT_ITEMS = 120;

export function buildSyncConflictReport(local: SyncSnapshot, remote: SyncSnapshot, now = new Date().toISOString()): SyncConflictReport {
  const items: SyncConflictItem[] = [];

  compareUpdatedEntities(
    'connection',
    local.connections ?? [],
    remote.connections ?? [],
    (connection) => connection.name || connection.id,
    (connection) => JSON.stringify({
      name: connection.name,
      baseUrl: connection.baseUrl,
      model: connection.model,
      enabled: connection.enabled,
      avatarUri: connection.avatarUri,
      profile: connection.profile,
    }),
    items,
  );

  compareUpdatedEntities(
    'room',
    local.rooms ?? [],
    remote.rooms ?? [],
    (room) => room.name || room.id,
    (room) => JSON.stringify({
      name: room.name,
      kind: room.kind,
      members: room.members,
      sessionIds: room.sessionIds,
      memberSessionKeys: room.memberSessionKeys,
      contextLimit: room.contextLimit,
      roleplay: room.roleplay,
      roleplaySession: room.roleplaySession,
    }),
    items,
  );

  compareMessageMaps(local.messagesByRoom ?? {}, remote.messagesByRoom ?? {}, items);
  compareSquareEvents(local.squareEvents ?? [], remote.squareEvents ?? [], items);

  const sorted = items.sort(sortConflictItems);
  const truncated = sorted.length > MAX_CONFLICT_ITEMS;
  const visibleItems = sorted.slice(0, MAX_CONFLICT_ITEMS);

  return {
    checkedAt: now,
    localUpdatedAt: local.updatedAt,
    remoteUpdatedAt: remote.updatedAt,
    summary: summarizeConflictItems(sorted),
    items: visibleItems,
    truncated,
  };
}

function compareUpdatedEntities<T extends { id: string; updatedAt?: string }>(
  entity: SyncConflictEntity,
  localItems: T[],
  remoteItems: T[],
  labelOf: (item: T) => string,
  comparableOf: (item: T) => string,
  output: SyncConflictItem[],
): void {
  const localById = new Map(localItems.map((item) => [item.id, item]));
  const remoteById = new Map(remoteItems.map((item) => [item.id, item]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  for (const id of ids) {
    const local = localById.get(id);
    const remote = remoteById.get(id);
    if (local && !remote) {
      output.push({ id, entity, label: labelOf(local), status: 'local-only', localUpdatedAt: local.updatedAt });
      continue;
    }
    if (!local && remote) {
      output.push({ id, entity, label: labelOf(remote), status: 'remote-only', remoteUpdatedAt: remote.updatedAt });
      continue;
    }
    if (!local || !remote) continue;

    const localComparable = comparableOf(local);
    const remoteComparable = comparableOf(remote);
    if (localComparable === remoteComparable) continue;

    const localTime = parseTime(local.updatedAt);
    const remoteTime = parseTime(remote.updatedAt);
    if (localTime > remoteTime) {
      output.push({ id, entity, label: labelOf(local), status: 'local-newer', localUpdatedAt: local.updatedAt, remoteUpdatedAt: remote.updatedAt });
    } else if (remoteTime > localTime) {
      output.push({ id, entity, label: labelOf(remote), status: 'remote-newer', localUpdatedAt: local.updatedAt, remoteUpdatedAt: remote.updatedAt });
    } else {
      output.push({ id, entity, label: labelOf(local), status: 'same-time-different', localUpdatedAt: local.updatedAt, remoteUpdatedAt: remote.updatedAt });
    }
  }
}

function compareMessageMaps(
  local: Record<string, ChatMessage[]>,
  remote: Record<string, ChatMessage[]>,
  output: SyncConflictItem[],
): void {
  const localMessages = flattenMessages(local);
  const remoteMessages = flattenMessages(remote);
  const ids = new Set([...localMessages.keys(), ...remoteMessages.keys()]);

  for (const id of ids) {
    const localMessage = localMessages.get(id);
    const remoteMessage = remoteMessages.get(id);
    if (localMessage && !remoteMessage) {
      output.push({
        id,
        entity: 'message',
        label: localMessage.authorName || id,
        status: 'local-only',
        localUpdatedAt: localMessage.createdAt,
        detail: previewText(localMessage.content),
      });
      continue;
    }
    if (!localMessage && remoteMessage) {
      output.push({
        id,
        entity: 'message',
        label: remoteMessage.authorName || id,
        status: 'remote-only',
        remoteUpdatedAt: remoteMessage.createdAt,
        detail: previewText(remoteMessage.content),
      });
      continue;
    }
    if (!localMessage || !remoteMessage) continue;

    const localComparable = comparableMessage(localMessage);
    const remoteComparable = comparableMessage(remoteMessage);
    if (localComparable === remoteComparable) continue;

    const localTime = parseTime(localMessage.createdAt);
    const remoteTime = parseTime(remoteMessage.createdAt);
    const status: SyncConflictStatus = localTime > remoteTime
      ? 'local-newer'
      : remoteTime > localTime
        ? 'remote-newer'
        : 'same-time-different';
    output.push({
      id,
      entity: 'message',
      label: localMessage.authorName || remoteMessage.authorName || id,
      status,
      localUpdatedAt: localMessage.createdAt,
      remoteUpdatedAt: remoteMessage.createdAt,
      detail: previewText(localMessage.content || remoteMessage.content),
    });
  }
}

function compareSquareEvents(local: SquareEvent[], remote: SquareEvent[], output: SyncConflictItem[]): void {
  const localById = new Map(local.map((event) => [event.id, event]));
  const remoteById = new Map(remote.map((event) => [event.id, event]));
  const ids = new Set([...localById.keys(), ...remoteById.keys()]);

  for (const id of ids) {
    const localEvent = localById.get(id);
    const remoteEvent = remoteById.get(id);
    if (localEvent && !remoteEvent) {
      output.push({ id, entity: 'squareEvent', label: localEvent.title || id, status: 'local-only', localUpdatedAt: localEvent.createdAt });
      continue;
    }
    if (!localEvent && remoteEvent) {
      output.push({ id, entity: 'squareEvent', label: remoteEvent.title || id, status: 'remote-only', remoteUpdatedAt: remoteEvent.createdAt });
      continue;
    }
    if (!localEvent || !remoteEvent) continue;
    if (JSON.stringify(localEvent) === JSON.stringify(remoteEvent)) continue;

    const localTime = parseTime(localEvent.createdAt);
    const remoteTime = parseTime(remoteEvent.createdAt);
    output.push({
      id,
      entity: 'squareEvent',
      label: localEvent.title || remoteEvent.title || id,
      status: localTime > remoteTime ? 'local-newer' : remoteTime > localTime ? 'remote-newer' : 'same-time-different',
      localUpdatedAt: localEvent.createdAt,
      remoteUpdatedAt: remoteEvent.createdAt,
    });
  }
}

function flattenMessages(messagesByRoom: Record<string, ChatMessage[]>): Map<string, ChatMessage> {
  const byId = new Map<string, ChatMessage>();
  for (const messages of Object.values(messagesByRoom)) {
    for (const message of messages) byId.set(message.id, message);
  }
  return byId;
}

function comparableMessage(message: ChatMessage): string {
  return JSON.stringify({
    roomId: message.roomId,
    role: message.role,
    authorId: message.authorId,
    authorName: message.authorName,
    content: message.content,
    attachments: message.attachments?.map((attachment) => ({ id: attachment.id, name: attachment.name, mimeType: attachment.mimeType, size: attachment.size, kind: attachment.kind })),
    status: message.status,
    error: message.error,
    delegatedFrom: message.delegatedFrom,
  });
}

function summarizeConflictItems(items: SyncConflictItem[]): SyncConflictSummary {
  return {
    localOnly: items.filter((item) => item.status === 'local-only').length,
    remoteOnly: items.filter((item) => item.status === 'remote-only').length,
    localNewer: items.filter((item) => item.status === 'local-newer').length,
    remoteNewer: items.filter((item) => item.status === 'remote-newer').length,
    sameTimeDifferent: items.filter((item) => item.status === 'same-time-different').length,
    total: items.length,
  };
}

function sortConflictItems(a: SyncConflictItem, b: SyncConflictItem): number {
  const aTime = Math.max(parseTime(a.localUpdatedAt), parseTime(a.remoteUpdatedAt));
  const bTime = Math.max(parseTime(b.localUpdatedAt), parseTime(b.remoteUpdatedAt));
  if (aTime !== bTime) return bTime - aTime;
  return `${a.entity}:${a.label}`.localeCompare(`${b.entity}:${b.label}`);
}

function parseTime(value?: string): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function previewText(value?: string): string | undefined {
  if (!value) return undefined;
  return value.length > 100 ? `${value.slice(0, 100)}…` : value;
}
