import { ChatMessage, HermesConnection, Room } from '../types';
import { getJson, setJson } from './kv';

const CONNECTIONS_KEY = 'laphiny.connections.v1';
const ROOMS_KEY = 'laphiny.rooms.v1';
const MESSAGES_KEY = 'laphiny.messages.v1';

export async function loadConnections(): Promise<HermesConnection[]> {
  return getJson<HermesConnection[]>(CONNECTIONS_KEY, []);
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
