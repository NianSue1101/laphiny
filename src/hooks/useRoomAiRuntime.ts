import { useState } from 'react';

import { DEFAULT_CONTEXT_LIMIT } from '../config/app_config';
import { getErrorMessage, makeId, makeLocalNotice, showNotice } from '../app/app_utils';
import type { ParsedCollaborationRitual } from '../lib/collaboration_rituals';
import { summarizeRoomMemory } from '../lib/room_memory';
import {
  generateRitualConsensusContent,
  generateRoleplayArchiveDraft,
  generateRoomMemoryCapsuleDraft,
  generateRoomSummaryContent,
  makeRoomSummary,
} from '../lib/room_ai_runtime';
import { makeDefaultRoleplayArchive, summarizeRoleplayArchive } from '../lib/stage4_plus';
import type {
  ChatMessage,
  CollaborationEvent,
  DiagnosticLogEntry,
  HermesConnection,
  RoleplayConfig,
  Room,
} from '../types';

type LogInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };
type CollaborationEventInput = Omit<CollaborationEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

type UseRoomAiRuntimeOptions = {
  selectedRoom: Room | null;
  messagesByRoom: Record<string, ChatMessage[]>;
  connections: HermesConnection[];
  connectionById: Map<string, HermesConnection>;
  appendMessagesToRoom: (roomId: string, messages: ChatMessage[]) => void;
  appendCollaborationEvent: (input: CollaborationEventInput) => void;
  appendDiagnosticLog: (input: LogInput) => void;
  updateRoomById: (roomId: string, patch: Partial<Room>) => void;
  updateSelectedRoom: (patch: Partial<Room>) => void;
  updateSelectedRoomRoleplay: (patch: Partial<RoleplayConfig>) => void;
};

export function useRoomAiRuntime({
  selectedRoom,
  messagesByRoom,
  connections,
  connectionById,
  appendMessagesToRoom,
  appendCollaborationEvent,
  appendDiagnosticLog,
  updateRoomById,
  updateSelectedRoom,
  updateSelectedRoomRoleplay,
}: UseRoomAiRuntimeOptions) {
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [memoryGenerating, setMemoryGenerating] = useState(false);
  const [rpArchiveGenerating, setRpArchiveGenerating] = useState(false);

  async function generateRoleplayArchive() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const roleplay = selectedRoom.roleplay;
    if (!roleplay?.enabled) {
      showNotice('请先开启 RP 模式');
      return;
    }
    const gm = selectedRoom.members.find((member) => member.connectionId === roleplay.gmConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!gm) {
      showNotice('没有可用于整理档案的 GM');
      return;
    }
    const connection = connectionById.get(gm.connectionId);
    if (!connection) {
      showNotice('GM 连接不存在');
      return;
    }
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    const fallback = roleplay.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, roleplay);
    setRpArchiveGenerating(true);
    const requestId = makeId('rpArchive');
    const startedAt = Date.now();
    try {
      const archive = await generateRoleplayArchiveDraft({
        room: selectedRoom,
        connection,
        messages,
        fallback,
      });
      updateSelectedRoomRoleplay({ archive });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `RP 剧本档案已更新（v${archive.version}）：${summarizeRoleplayArchive(archive)}`)]);
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: gm.alias,
        title: 'RP 剧本档案已更新',
        body: summarizeRoleplayArchive(archive),
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: 'RP 剧本档案已更新',
        message: summarizeRoleplayArchive(archive),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: gm.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('RP 档案已更新', summarizeRoleplayArchive(archive));
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: 'RP 剧本档案更新失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: gm.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('RP 档案更新失败', getErrorMessage(error));
    } finally {
      setRpArchiveGenerating(false);
    }
  }

  async function generateRoomSummary() {
    if (!selectedRoom) return;
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    if (messages.length === 0) {
      showNotice('没有可总结的消息');
      return;
    }

    const summaryMember = selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!summaryMember) {
      showNotice('没有可用于总结的成员');
      return;
    }
    const connection = connectionById.get(summaryMember.connectionId);
    if (!connection) {
      showNotice('总结成员连接不存在');
      return;
    }

    setSummaryGenerating(true);
    const requestId = makeId('summary');
    const startedAt = Date.now();
    try {
      const content = await generateRoomSummaryContent({
        room: selectedRoom,
        member: summaryMember,
        connection,
        messages,
        connections,
        contextLimit: selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT,
      });
      const summary = makeRoomSummary({
        id: makeId('summary'),
        room: selectedRoom,
        member: summaryMember,
        content,
        sourceMessageCount: messages.length,
      });
      updateSelectedRoom({ lastSummary: summary });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `本轮共识总结（${summaryMember.alias}）：\n${content}`)]);
      appendCollaborationEvent({
        kind: 'summary_created',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: summaryMember.alias,
        title: `${summaryMember.alias} 生成房间共识`,
        body: content,
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '房间总结已生成',
        message: `${summaryMember.alias} 总结了 ${messages.length} 条消息。`,
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: '房间总结生成失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('总结失败', getErrorMessage(error));
    } finally {
      setSummaryGenerating(false);
    }
  }

  async function generateRitualConsensus(room: Room, ritual: ParsedCollaborationRitual, turnMessages: ChatMessage[]) {
    const summaryMember = room.members.find((member) => member.connectionId === room.summaryConnectionId && member.enabled)
      ?? room.members.find((member) => member.enabled);
    if (!summaryMember) return;
    const connection = connectionById.get(summaryMember.connectionId);
    if (!connection) return;

    const agentMessages = turnMessages.filter((message) => (
      message.roomId === room.id
      && message.role === 'assistant'
      && message.status === 'sent'
      && message.authorId !== 'system'
    ));
    if (!agentMessages.length) return;

    const transcript = agentMessages.map((message) => `${message.authorName}：${message.content}`).join('\n\n');
    const requestId = makeId('ritual');
    const startedAt = Date.now();
    try {
      const content = await generateRitualConsensusContent({
        room,
        ritual,
        member: summaryMember,
        connection,
        transcript,
      });
      const summary = makeRoomSummary({
        id: makeId('summary'),
        room,
        member: summaryMember,
        content,
        sourceMessageCount: agentMessages.length,
      });
      updateRoomById(room.id, { lastSummary: summary });
      appendMessagesToRoom(room.id, [makeLocalNotice(room.id, `${ritual.definition.label}最终共识（${summaryMember.alias}）：\n${content}`)]);
      appendCollaborationEvent({
        kind: 'ritual_completed',
        roomId: room.id,
        roomName: room.name,
        source: summaryMember.alias,
        title: `${ritual.definition.label}已完成`,
        body: content,
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '协作仪式共识已生成',
        message: `${ritual.definition.label} · ${summaryMember.alias} 汇总 ${agentMessages.length} 条成员发言。`,
        roomId: room.id,
        roomName: room.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
        meta: { ritual: ritual.definition.id, messages: agentMessages.length },
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'chat',
        title: '协作仪式共识生成失败',
        message: getErrorMessage(error),
        roomId: room.id,
        roomName: room.name,
        connectionId: connection.id,
        connectionName: summaryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
        meta: { ritual: ritual.definition.id },
      });
    }
  }

  async function generateRoomMemoryCapsule() {
    if (!selectedRoom) return;
    const messages = (messagesByRoom[selectedRoom.id] ?? []).filter((message) => message.status === 'sent');
    if (!messages.length) {
      showNotice('没有可生成记忆的消息');
      return;
    }
    const memoryMember = selectedRoom.members.find((member) => member.connectionId === selectedRoom.summaryConnectionId && member.enabled)
      ?? selectedRoom.members.find((member) => member.enabled);
    if (!memoryMember) {
      showNotice('没有可用于生成记忆的成员');
      return;
    }
    const connection = connectionById.get(memoryMember.connectionId);
    if (!connection) {
      showNotice('记忆生成成员连接不存在');
      return;
    }

    setMemoryGenerating(true);
    const requestId = makeId('memory');
    const startedAt = Date.now();
    try {
      const capsule = await generateRoomMemoryCapsuleDraft({
        room: selectedRoom,
        member: memoryMember,
        connection,
        messages,
        previousVersion: selectedRoom.memoryCapsule?.version ?? 0,
      });
      updateSelectedRoom({ pendingMemoryCapsule: capsule });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(
        selectedRoom.id,
        `房间记忆草案已生成（v${capsule.version}），请在房间工具里确认后再沉淀：\n${summarizeRoomMemory(capsule)}`,
        'memory',
      )]);
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: memoryMember.alias,
        title: '房间记忆草案待确认',
        body: summarizeRoomMemory(capsule),
      });
      appendDiagnosticLog({
        level: 'success',
        category: 'chat',
        title: '房间记忆草案已生成',
        message: summarizeRoomMemory(capsule),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: memoryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('记忆草案已生成', '请在房间工具里确认后再写入长期房间记忆。');
    } catch (error) {
      appendDiagnosticLog({
        level: 'error',
        category: 'chat',
        title: '房间记忆胶囊生成失败',
        message: getErrorMessage(error),
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        connectionId: connection.id,
        connectionName: memoryMember.alias,
        requestId,
        durationMs: Date.now() - startedAt,
      });
      showNotice('记忆生成失败', getErrorMessage(error));
    } finally {
      setMemoryGenerating(false);
    }
  }

  return {
    memoryGenerating,
    rpArchiveGenerating,
    summaryGenerating,
    generateRitualConsensus,
    generateRoleplayArchive,
    generateRoomMemoryCapsule,
    generateRoomSummary,
  };
}
