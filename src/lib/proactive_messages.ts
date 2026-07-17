import type { ChatMessage, ProactiveAgentMessageEvent, Room } from '../types';

export interface ProactiveMessageIngestion {
  acceptedByRoom: Record<string, ChatMessage[]>;
  rejected: Array<{ event: ProactiveAgentMessageEvent; reason: string }>;
  lastSequence: number;
}

export function ingestProactiveAgentMessages({
  events,
  rooms,
  messagesByRoom,
  receivedAt = new Date().toISOString(),
}: {
  events: ProactiveAgentMessageEvent[];
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  receivedAt?: string;
}): ProactiveMessageIngestion {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const existingMessageIds = new Set(Object.values(messagesByRoom).flat().map((message) => message.id));
  const existingEventIds = new Set(Object.values(messagesByRoom).flat().map((message) => message.inboundEventId).filter(Boolean));
  const acceptedByRoom: Record<string, ChatMessage[]> = {};
  const rejected: ProactiveMessageIngestion['rejected'] = [];
  let lastSequence = 0;

  for (const event of [...events].sort((left, right) => left.sequence - right.sequence)) {
    lastSequence = Math.max(lastSequence, Number.isSafeInteger(event.sequence) ? event.sequence : 0);
    const reason = validateProactiveAgentMessage(event, roomById.get(event.roomId));
    if (reason) {
      rejected.push({ event, reason });
      continue;
    }
    if (existingMessageIds.has(event.message.id) || existingEventIds.has(event.eventId)) continue;

    existingMessageIds.add(event.message.id);
    existingEventIds.add(event.eventId);
    (acceptedByRoom[event.roomId] ??= []).push({
      ...event.message,
      roomId: event.roomId,
      role: 'assistant',
      authorId: event.connectionId,
      authorName: event.authorName,
      status: 'sent',
      origin: 'proactive',
      inboundEventId: event.eventId,
      receivedAt,
    });
  }

  return { acceptedByRoom, rejected, lastSequence };
}

export function mergeProactiveMessages(
  messagesByRoom: Record<string, ChatMessage[]>,
  acceptedByRoom: Record<string, ChatMessage[]>,
): Record<string, ChatMessage[]> {
  const next = { ...messagesByRoom };
  for (const [roomId, incoming] of Object.entries(acceptedByRoom)) {
    const existing = next[roomId] ?? [];
    const existingIds = new Set(existing.map((message) => message.id));
    next[roomId] = [...existing, ...incoming.filter((message) => !existingIds.has(message.id))];
  }
  return next;
}

export function makeProactiveDeviceId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `laphiny-device-${randomId}`;
}

function validateProactiveAgentMessage(event: ProactiveAgentMessageEvent, room?: Room): string | null {
  if (event.protocol !== 'laphiny.proactive-message.v1') return '不支持的主动消息协议';
  if (!Number.isSafeInteger(event.sequence) || event.sequence <= 0) return '消息序号无效';
  if (!event.eventId || !event.roomId || !event.connectionId) return '消息寻址字段不完整';
  if (!room) return '目标房间在本机不存在';
  const member = room.members.find((item) => item.connectionId === event.connectionId && item.enabled);
  if (!member) return '发送 Agent 不在目标房间中或已禁用';
  if (!event.message || event.message.roomId !== event.roomId || event.message.authorId !== event.connectionId) {
    return '消息正文与服务端寻址不一致';
  }
  if (event.message.role !== 'assistant' || event.message.status !== 'sent') return '主动消息状态无效';
  if (!event.message.content?.trim()) return '主动消息正文为空';
  return null;
}
