import type { ChatMessage, DiagnosticLogEntry, HermesConnection, Room } from '../types';

export const MAX_DIAGNOSTIC_LOGS = 200;

export function makeDiagnosticLog(
  input: Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string },
): DiagnosticLogEntry {
  return {
    ...input,
    id: input.id ?? makeId('log'),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function appendDiagnosticLog(current: DiagnosticLogEntry[], entry: DiagnosticLogEntry): DiagnosticLogEntry[] {
  const byId = new Map<string, DiagnosticLogEntry>();
  for (const item of current) byId.set(item.id, item);
  byId.set(entry.id, entry);
  return Array.from(byId.values())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_DIAGNOSTIC_LOGS);
}

export function sanitizeDiagnosticLogs(value: unknown): DiagnosticLogEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeDiagnosticLog(item))
    .filter((item): item is DiagnosticLogEntry => Boolean(item))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-MAX_DIAGNOSTIC_LOGS);
}

export function buildDiagnosticBundle(input: {
  connections: HermesConnection[];
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  diagnosticLogs: DiagnosticLogEntry[];
  appVersion?: string;
  storage?: {
    secretBackend?: string;
    durableBackend?: string;
    durableDirectory?: string;
    messageBytes?: number;
  };
  runtime?: {
    platform?: string;
    online?: boolean;
    serviceWorkerStatus?: string;
    pwaInstalled?: boolean;
    width?: number;
    layoutMode?: string;
  };
}): string {
  const messagesCount = Object.values(input.messagesByRoom).reduce((total, messages) => total + messages.length, 0);
  const failedMessages = Object.values(input.messagesByRoom)
    .flat()
    .filter((message) => message.status === 'error')
    .slice(-20)
    .map((message) => ({
      id: message.id,
      roomId: message.roomId,
      authorName: message.authorName,
      error: message.error,
      createdAt: message.createdAt,
    }));

  const bundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: input.appVersion ?? 'unknown',
    summary: {
      connections: input.connections.length,
      enabledConnections: input.connections.filter((connection) => connection.enabled).length,
      rooms: input.rooms.length,
      messages: messagesCount,
      failedMessages: failedMessages.length,
      diagnosticLogs: input.diagnosticLogs.length,
      messageBytes: input.storage?.messageBytes,
    },
    storage: input.storage ? {
      secretBackend: input.storage.secretBackend,
      durableBackend: input.storage.durableBackend,
      durableDirectory: input.storage.durableDirectory,
      messageBytes: input.storage.messageBytes,
    } : undefined,
    runtime: input.runtime ? {
      platform: input.runtime.platform,
      online: input.runtime.online,
      serviceWorkerStatus: input.runtime.serviceWorkerStatus,
      pwaInstalled: input.runtime.pwaInstalled,
      width: input.runtime.width,
      layoutMode: input.runtime.layoutMode,
    } : undefined,
    connections: input.connections.map((connection) => ({
      id: connection.id,
      name: connection.name,
      baseUrl: redactUrl(connection.baseUrl),
      model: connection.model,
      enabled: connection.enabled,
      hasApiKey: Boolean(connection.apiKey),
      hasProfile: Boolean(connection.profile),
      updatedAt: connection.updatedAt,
    })),
    rooms: input.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      kind: room.kind,
      members: room.members.map((member) => ({ alias: member.alias, connectionId: member.connectionId, enabled: member.enabled })),
      messages: input.messagesByRoom[room.id]?.length ?? 0,
      contextLimit: room.contextLimit,
      updatedAt: room.updatedAt,
    })),
    failedMessages,
    diagnosticLogs: input.diagnosticLogs.slice(-100).map((log) => ({
      ...log,
      message: redactSecretText(log.message),
      meta: redactMeta(log.meta),
    })),
  };

  return JSON.stringify(bundle, null, 2);
}

function normalizeDiagnosticLog(value: unknown): DiagnosticLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DiagnosticLogEntry>;
  if (!raw.title || !raw.category || !raw.level) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : makeId('log'),
    level: raw.level,
    category: raw.category,
    title: String(raw.title),
    message: raw.message ? String(raw.message) : undefined,
    roomId: raw.roomId ? String(raw.roomId) : undefined,
    roomName: raw.roomName ? String(raw.roomName) : undefined,
    connectionId: raw.connectionId ? String(raw.connectionId) : undefined,
    connectionName: raw.connectionName ? String(raw.connectionName) : undefined,
    requestId: raw.requestId ? String(raw.requestId) : undefined,
    durationMs: typeof raw.durationMs === 'number' ? raw.durationMs : undefined,
    meta: raw.meta && typeof raw.meta === 'object' ? redactMeta(raw.meta) : undefined,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
  };
}

function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.username) url.username = '***';
    if (url.password) url.password = '***';
    for (const key of ['key', 'api_key', 'apikey', 'token', 'access_token']) {
      if (url.searchParams.has(key)) url.searchParams.set(key, '***');
    }
    return url.toString();
  } catch {
    return redactSecretText(value) ?? '';
  }
}

function redactSecretText(value?: string): string | undefined {
  if (!value) return value;
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+\-/=]+/gi, 'Bearer ***')
    .replace(/(api[_-]?key|token|secret|password)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2***')
    .replace(/([A-Fa-f0-9]{24,}|[A-Za-z0-9_\-]{36,})/g, '***');
}

function redactMeta(meta?: Record<string, string | number | boolean | null | undefined>): Record<string, string | number | boolean | null | undefined> | undefined {
  if (!meta) return undefined;
  const next: Record<string, string | number | boolean | null | undefined> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (/api|key|token|secret|password/i.test(key)) {
      next[key] = value ? '***' : value;
    } else if (typeof value === 'string') {
      next[key] = redactSecretText(value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
