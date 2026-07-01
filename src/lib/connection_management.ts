import type { HermesConnection, Room } from '../types';
import { normalizeImportedAgentProfile } from './agent_profile';

export interface ConnectionFormValues {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export type ConnectionFormResult =
  | { ok: true; value: ConnectionFormValues }
  | { ok: false; title: string; message?: string };

export function normalizeConnectionForm(form: ConnectionFormValues, defaultModel: string): ConnectionFormResult {
  const name = form.name.trim();
  const baseUrl = form.baseUrl.trim().replace(/\/+$/, '');
  const apiKey = form.apiKey.trim();
  const model = form.model.trim() || defaultModel;

  if (!name || !baseUrl) {
    return { ok: false, title: '请填写连接名称和 Hermes API 地址' };
  }

  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      return { ok: false, title: 'Hermes API 地址必须以 http:// 或 https:// 开头' };
    }
  } catch {
    return { ok: false, title: 'Hermes API 地址格式不正确' };
  }

  return { ok: true, value: { name, baseUrl, apiKey, model } };
}

export type ImportedConnectionsResult =
  | { ok: true; connections: HermesConnection[] }
  | { ok: false; title: string; message?: string };

export function parseImportedConnections(
  text: string,
  defaultModel: string,
  makeId: (prefix: string) => string,
  now = new Date().toISOString(),
): ImportedConnectionsResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, title: 'JSON 格式错误', message: '文本不是有效的 JSON' };
  }

  if (!Array.isArray(data)) {
    return { ok: false, title: 'JSON 格式错误', message: 'JSON 必须是连接对象数组' };
  }

  const connections: HermesConnection[] = [];
  for (const item of data) {
    if (!item || typeof item !== 'object') continue;
    const rawItem = item as Record<string, unknown>;
    const name = String(rawItem.name ?? '').trim();
    const baseUrl = String(rawItem.baseUrl ?? '').trim();
    if (!name || !baseUrl) continue;

    connections.push({
      id: makeId('conn'),
      name,
      baseUrl,
      apiKey: String(rawItem.apiKey ?? ''),
      model: String(rawItem.model || defaultModel),
      enabled: rawItem.enabled !== false,
      avatarUri: typeof rawItem.avatarUri === 'string' ? rawItem.avatarUri : undefined,
      profile: normalizeImportedAgentProfile(rawItem.profile),
      createdAt: now,
      updatedAt: now,
    });
  }

  if (connections.length === 0) {
    return { ok: false, title: '没有可导入的连接', message: 'JSON 中没有有效的连接数据' };
  }

  return { ok: true, connections };
}

export function mergeImportedConnections(current: HermesConnection[], imported: HermesConnection[]) {
  const existingNames = new Set(current.map((connection) => connection.name));
  const newConnections = imported.filter((connection) => !existingNames.has(connection.name));
  return {
    connections: newConnections.length ? [...current, ...newConnections] : current,
    added: newConnections.length,
    skipped: imported.length - newConnections.length,
  };
}

export function updateRoomsForConnectionRename(
  rooms: Room[],
  connection: HermesConnection,
  nextName: string,
  now = new Date().toISOString(),
): Room[] {
  return rooms.map((room) => {
    const members = room.members.map((member) => (
      member.connectionId === connection.id && member.alias === connection.name
        ? { ...member, alias: nextName }
        : member
    ));
    const name = room.kind === 'direct' && room.members[0]?.connectionId === connection.id && room.name === connection.name
      ? nextName
      : room.name;
    return { ...room, name, members, updatedAt: now };
  });
}

export function removeConnectionFromRooms(rooms: Room[], connectionId: string, now = new Date().toISOString()): Room[] {
  return rooms
    .map((room) => {
      if (room.kind !== 'group') return room;
      const members = room.members.filter((member) => member.connectionId !== connectionId);
      if (members.length === room.members.length) return room;
      const sessionIds = { ...room.sessionIds };
      delete sessionIds[connectionId];
      const memberSessionKeys = room.memberSessionKeys ? { ...room.memberSessionKeys } : undefined;
      if (memberSessionKeys) delete memberSessionKeys[connectionId];
      return {
        ...room,
        members,
        sessionIds,
        memberSessionKeys,
        summaryConnectionId: room.summaryConnectionId === connectionId ? undefined : room.summaryConnectionId,
        updatedAt: now,
      };
    })
    .filter((room) => !(room.kind === 'direct' && room.members.some((member) => member.connectionId === connectionId)));
}
