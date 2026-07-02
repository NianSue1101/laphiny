import { buildSummaryMessages } from '../app/chat_history';
import type {
  ChatMessage,
  HermesConnection,
  RoleplayArchive,
  Room,
  RoomMember,
  RoomMemoryCapsule,
  RoomSummary,
} from '../types';
import { buildRitualConsensusMessages, type ParsedCollaborationRitual } from './collaboration_rituals';
import { HermesClient } from './hermes_client';
import { buildRoomMemoryMessages, parseRoomMemoryResponse } from './room_memory';
import { buildRoleplayArchiveMessages, parseRoleplayArchiveResponse } from './stage4_plus';

export async function generateRoomSummaryContent({
  room,
  member,
  connection,
  messages,
  connections,
  contextLimit,
}: {
  room: Room;
  member: RoomMember;
  connection: HermesConnection;
  messages: ChatMessage[];
  connections: HermesConnection[];
  contextLimit: number;
}): Promise<string> {
  const client = new HermesClient(connection);
  const history = buildSummaryMessages(room, member, messages, connections, contextLimit);
  const response = await client.chatCompletion({
    model: connection.model,
    messages: history,
    stream: false,
  }, {
    sessionId: `laphiny-summary-${room.id}`,
    sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
    timeoutMs: 90_000,
  });
  return response.choices?.[0]?.message?.content?.trim() || '没有生成总结。';
}

export async function generateRitualConsensusContent({
  room,
  ritual,
  member,
  connection,
  transcript,
}: {
  room: Room;
  ritual: ParsedCollaborationRitual;
  member: RoomMember;
  connection: HermesConnection;
  transcript: string;
}): Promise<string> {
  const client = new HermesClient(connection);
  const response = await client.chatCompletion({
    model: connection.model,
    messages: buildRitualConsensusMessages({ ritual, room, transcript, summaryMember: member }),
    stream: false,
  }, {
    sessionId: `laphiny-ritual-${room.id}`,
    sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
    timeoutMs: 90_000,
  });
  return response.choices?.[0]?.message?.content?.trim() || '没有生成仪式共识。';
}

export async function generateRoomMemoryCapsuleDraft({
  room,
  member,
  connection,
  messages,
  previousVersion,
}: {
  room: Room;
  member: RoomMember;
  connection: HermesConnection;
  messages: ChatMessage[];
  previousVersion: number;
}): Promise<RoomMemoryCapsule> {
  const client = new HermesClient(connection);
  const response = await client.chatCompletion({
    model: connection.model,
    messages: buildRoomMemoryMessages(room, member, messages),
    stream: false,
  }, {
    sessionId: `laphiny-memory-${room.id}`,
    sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
    timeoutMs: 90_000,
  });
  const text = response.choices?.[0]?.message?.content ?? '';
  return {
    ...parseRoomMemoryResponse(text, room.id, member.alias),
    version: previousVersion + 1,
  };
}

export async function generateRoleplayArchiveDraft({
  room,
  connection,
  messages,
  fallback,
}: {
  room: Room;
  connection: HermesConnection;
  messages: ChatMessage[];
  fallback: RoleplayArchive;
}): Promise<RoleplayArchive> {
  const client = new HermesClient(connection);
  const response = await client.chatCompletion({
    model: connection.model,
    messages: buildRoleplayArchiveMessages(room, messages),
    stream: false,
  }, {
    sessionId: `laphiny-rp-archive-${room.id}`,
    sessionKey: room.memberSessionKeys?.[connection.id] ?? room.sessionKey,
    timeoutMs: 90_000,
  });
  const text = response.choices?.[0]?.message?.content ?? '';
  return parseRoleplayArchiveResponse(text, fallback);
}

export function makeRoomSummary({
  id,
  room,
  member,
  content,
  sourceMessageCount,
  createdAt = new Date().toISOString(),
}: {
  id: string;
  room: Room;
  member: RoomMember;
  content: string;
  sourceMessageCount: number;
  createdAt?: string;
}): RoomSummary {
  return {
    id,
    roomId: room.id,
    authorConnectionId: member.connectionId,
    authorName: member.alias,
    content,
    sourceMessageCount,
    createdAt,
  };
}
