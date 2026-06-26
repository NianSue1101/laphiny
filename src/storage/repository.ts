import { ChatMessage, HermesConnection, Room } from '../types';
import { getJson, setJson } from './kv';

const CONNECTIONS_KEY = 'laphiny.connections.v1';
const ROOMS_KEY = 'laphiny.rooms.v1';
const MESSAGES_KEY = 'laphiny.messages.v1';

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
  return getJson<Room[]>(ROOMS_KEY, []);
}

export async function saveRooms(rooms: Room[]): Promise<void> {
  await setJson(ROOMS_KEY, rooms);
}

export async function loadMessages(): Promise<Record<string, ChatMessage[]>> {
  return getJson<Record<string, ChatMessage[]>>(MESSAGES_KEY, {});
}

export async function saveMessages(messages: Record<string, ChatMessage[]>): Promise<void> {
  await setJson(MESSAGES_KEY, messages);
}
