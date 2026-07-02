import { useEffect, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import * as Clipboard from 'expo-clipboard';

import { DEFAULT_CONTEXT_LIMIT, MAX_DELEGATION_DEPTH } from '../config/app_config';
import { buildMarkdownExport, makeId, makeLocalNotice, requestConfirm, showNotice } from '../app/app_utils';
import { applyMemoryCapsuleToRoomGrowth, applyRoomStatePatchFromText } from '../lib/room_growth';
import { summarizeRoomMemory } from '../lib/room_memory';
import { makeDefaultRoleplayConfig, summarizeRoleplayConfig } from '../lib/roleplay';
import { getRoomModeDefinition, makeDefaultRoleplayArchive } from '../lib/stage4_plus';
import type {
  AgentProfileVersion,
  ChatMessage,
  CollaborationEvent,
  DiagnosticLogEntry,
  HermesConnection,
  RoleplayConfig,
  Room,
  RoomBlackboardItemStatus,
  RoomDecisionRecordStatus,
  RoomMemoryCapsule,
  RoomMember,
  RoomModeId,
  TeamTemplate,
} from '../types';

type LogInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };
type CollaborationEventInput = Omit<CollaborationEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

type UseRoomToolsRuntimeOptions = {
  selectedRoom: Room | null;
  roomsRef: MutableRefObject<Room[]>;
  messagesByRoom: Record<string, ChatMessage[]>;
  setConnections: Dispatch<SetStateAction<HermesConnection[]>>;
  setMessagesByRoom: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  setSelectedRoomId: Dispatch<SetStateAction<string | null>>;
  setSelectedTargetIds: Dispatch<SetStateAction<string[]>>;
  setTeamTemplates: Dispatch<SetStateAction<TeamTemplate[]>>;
  setUnreadByRoom: Dispatch<SetStateAction<Record<string, number>>>;
  setRoomToolsOpen: Dispatch<SetStateAction<boolean>>;
  appendCollaborationEvent: (input: CollaborationEventInput) => void;
  appendDiagnosticLog: (input: LogInput) => void;
  appendMessagesToRoom: (roomId: string, messages: ChatMessage[]) => void;
};

export function useRoomToolsRuntime({
  selectedRoom,
  roomsRef,
  messagesByRoom,
  setConnections,
  setMessagesByRoom,
  setRooms,
  setSelectedRoomId,
  setSelectedTargetIds,
  setTeamTemplates,
  setUnreadByRoom,
  setRoomToolsOpen,
  appendCollaborationEvent,
  appendDiagnosticLog,
  appendMessagesToRoom,
}: UseRoomToolsRuntimeOptions) {
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [teamTemplateName, setTeamTemplateName] = useState('默认 Soul 小队');
  const [knowledgeTitleDraft, setKnowledgeTitleDraft] = useState('');
  const [knowledgeBodyDraft, setKnowledgeBodyDraft] = useState('');
  const [blackboardDraft, setBlackboardDraft] = useState('');
  const [decisionTitleDraft, setDecisionTitleDraft] = useState('');
  const [decisionRationaleDraft, setDecisionRationaleDraft] = useState('');

  useEffect(() => {
    setRoomNameDraft(selectedRoom?.name ?? '');
  }, [selectedRoom?.id, selectedRoom?.name]);

  function updateSelectedRoom(patch: Partial<Room>) {
    if (!selectedRoom) return;
    updateRoomById(selectedRoom.id, patch);
  }

  function updateRoomById(roomId: string, patch: Partial<Room>) {
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => (
      room.id === roomId ? { ...room, ...patch, updatedAt: now } : room
    )));
  }

  function applyAgentRoomStatePatch(roomId: string, authorName: string, text: string, sourceMessageId?: string) {
    const now = new Date().toISOString();
    const room = roomsRef.current.find((item) => item.id === roomId);
    if (!room) return;
    const application = applyRoomStatePatchFromText(room, text, authorName, now, makeId);
    if (!application) return;
    updateRoomById(roomId, application.patch);
    const appliedCounts = application.counts;
    const total = appliedCounts.knowledge + appliedCounts.blackboard + appliedCounts.decisions + appliedCounts.resolvedBlackboard;
    if (total <= 0) return;
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId,
      roomName: room?.name ?? '未知房间',
      source: authorName,
      messageId: sourceMessageId,
      title: `${authorName} 更新房间状态`,
      body: `知识 ${appliedCounts.knowledge} · 黑板 ${appliedCounts.blackboard} · 决策 ${appliedCounts.decisions} · 已解决 ${appliedCounts.resolvedBlackboard}`,
    });
    appendDiagnosticLog({
      level: 'success',
      category: 'chat',
      title: 'Agent 房间状态写入完成',
      message: `${authorName} 通过 laphiny-room-state 更新了房间状态。`,
      roomId,
      roomName: room?.name,
      meta: appliedCounts,
    });
  }

  function renameSelectedRoom() {
    if (!selectedRoom) return;
    const name = roomNameDraft.trim();
    if (!name) {
      showNotice('房间名不能为空');
      return;
    }
    updateSelectedRoom({ name });
    showNotice('房间已重命名', name);
  }

  function addRoomKnowledgeItem() {
    if (!selectedRoom) return;
    const title = knowledgeTitleDraft.trim();
    const body = knowledgeBodyDraft.trim();
    if (!title || !body) {
      showNotice('知识条目不完整', '请填写标题和内容。');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      knowledgeBase: [
        ...(selectedRoom.knowledgeBase ?? []),
        {
          id: makeId('knowledge'),
          title,
          body,
          tags: ['manual'],
          source: 'manual' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-80),
    });
    setKnowledgeTitleDraft('');
    setKnowledgeBodyDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '房间知识库已补充',
      body: title,
    });
  }

  function removeRoomKnowledgeItem(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      knowledgeBase: (selectedRoom.knowledgeBase ?? []).filter((item) => item.id !== itemId),
    });
  }

  function addRoomBlackboardItem() {
    if (!selectedRoom) return;
    const text = blackboardDraft.trim();
    if (!text) {
      showNotice('黑板内容不能为空');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      blackboardItems: [
        ...(selectedRoom.blackboardItems ?? []),
        {
          id: makeId('blackboard'),
          text,
          authorName: '用户',
          status: 'open' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-120),
    });
    setBlackboardDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '协作黑板已更新',
      body: text,
    });
  }

  function updateRoomBlackboardItemStatus(itemId: string, status: RoomBlackboardItemStatus) {
    if (!selectedRoom) return;
    const now = new Date().toISOString();
    updateSelectedRoom({
      blackboardItems: (selectedRoom.blackboardItems ?? []).map((item) => (
        item.id === itemId ? { ...item, status, updatedAt: now } : item
      )),
    });
  }

  function removeRoomBlackboardItem(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      blackboardItems: (selectedRoom.blackboardItems ?? []).filter((item) => item.id !== itemId),
    });
  }

  function addRoomDecisionRecord() {
    if (!selectedRoom) return;
    const title = decisionTitleDraft.trim();
    const rationale = decisionRationaleDraft.trim();
    if (!title) {
      showNotice('决策标题不能为空');
      return;
    }
    const now = new Date().toISOString();
    updateSelectedRoom({
      decisionRecords: [
        ...(selectedRoom.decisionRecords ?? []),
        {
          id: makeId('decision'),
          title,
          rationale: rationale || undefined,
          ownerName: '用户',
          source: 'manual' as const,
          status: 'active' as const,
          createdAt: now,
          updatedAt: now,
        },
      ].slice(-80),
    });
    setDecisionTitleDraft('');
    setDecisionRationaleDraft('');
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '决策记录已新增',
      body: title,
    });
  }

  function updateRoomDecisionStatus(itemId: string, status: RoomDecisionRecordStatus) {
    if (!selectedRoom) return;
    const now = new Date().toISOString();
    updateSelectedRoom({
      decisionRecords: (selectedRoom.decisionRecords ?? []).map((item) => (
        item.id === itemId ? { ...item, status, updatedAt: now } : item
      )),
    });
  }

  function removeRoomDecisionRecord(itemId: string) {
    if (!selectedRoom) return;
    updateSelectedRoom({
      decisionRecords: (selectedRoom.decisionRecords ?? []).filter((item) => item.id !== itemId),
    });
  }

  function deleteSelectedRoom() {
    if (!selectedRoom) return;
    const roomToDelete = selectedRoom;
    requestConfirm('删除房间', `将删除「${roomToDelete.name}」及其本地消息记录。不会删除 Hermes 连接配置或服务端记忆。`, () => {
      setRooms((current) => {
        const next = current.filter((room) => room.id !== roomToDelete.id);
        setSelectedRoomId(next[0]?.id ?? null);
        return next;
      });
      setMessagesByRoom((current) => {
        const next = { ...current };
        delete next[roomToDelete.id];
        return next;
      });
      setUnreadByRoom((current) => {
        const next = { ...current };
        delete next[roomToDelete.id];
        return next;
      });
      setRoomToolsOpen(false);
    });
  }

  function updateSelectedRoomRoleplay(patch: Partial<RoleplayConfig>) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const base = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const next: RoleplayConfig = {
      ...base,
      ...patch,
      gmConnectionId: patch.gmConnectionId ?? base.gmConnectionId ?? enabledMember?.connectionId,
      updatedAt: new Date().toISOString(),
    };
    updateSelectedRoom({ roleplay: next });
  }

  function toggleSelectedRoomRoleplay() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const current = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const nextEnabled = !current.enabled;
    updateSelectedRoom({
      mode: nextEnabled ? 'tabletop' : selectedRoom.mode,
      roleplay: {
        ...current,
        enabled: nextEnabled,
        gmConnectionId: current.gmConnectionId ?? enabledMember?.connectionId,
        archive: nextEnabled ? current.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, current) : current.archive,
        updatedAt: new Date().toISOString(),
      },
    });
    appendCollaborationEvent({
      kind: nextEnabled ? 'roleplay_started' : 'roleplay_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: nextEnabled ? 'RP 模式已开启' : 'RP 模式已关闭',
      body: nextEnabled ? summarizeRoleplayConfig({ ...current, enabled: true }) : '已切回普通 Soul 协作模式。',
    });
    showNotice(nextEnabled ? 'RP 模式已开启' : 'RP 模式已关闭', nextEnabled ? '普通输入会由 GM 先推进剧情，再让其他 Agent 入戏回应。' : '群聊已恢复普通协作触发规则。');
  }

  function applyRoomMode(mode: RoomModeId) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const definition = getRoomModeDefinition(mode);
    const enabledMember = selectedRoom.members.find((member) => member.enabled);
    const baseRoleplay = selectedRoom.roleplay ?? makeDefaultRoleplayConfig(enabledMember?.connectionId);
    const nextRoleplay: RoleplayConfig | undefined = definition.roleplayEnabled
      ? {
          ...baseRoleplay,
          enabled: true,
          gmConnectionId: baseRoleplay.gmConnectionId ?? enabledMember?.connectionId,
          archive: baseRoleplay.archive ?? makeDefaultRoleplayArchive(selectedRoom.name, baseRoleplay),
          updatedAt: new Date().toISOString(),
        }
      : selectedRoom.roleplay
        ? { ...selectedRoom.roleplay, enabled: false, updatedAt: new Date().toISOString() }
        : undefined;
    updateSelectedRoom({
      mode,
      defaultCollaborationMode: definition.defaultCollaborationMode,
      autoDelegationEnabled: definition.autoDelegationEnabled,
      roleplay: nextRoleplay,
    });
    appendCollaborationEvent({
      kind: definition.roleplayEnabled ? 'roleplay_started' : 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: `房间模式切换为${definition.label}`,
      body: definition.description,
    });
    showNotice('房间模式已切换', `${definition.label}：${definition.description}`);
  }

  function clearRoleplayArchive() {
    if (!selectedRoom?.roleplay?.archive) return;
    requestConfirm('清空 RP 剧本档案', '只会清空 Laphiny 记录的剧本档案，不会删除聊天记录或 Hermes Soul 记忆。', () => {
      updateSelectedRoomRoleplay({ archive: undefined });
      appendCollaborationEvent({
        kind: 'roleplay_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: 'Laphiny',
        title: 'RP 剧本档案已清空',
        body: '用户清空了当前房间的 RP 档案。',
      });
    });
  }

  function updateSelectedRoomMember(connectionId: string, patch: Partial<RoomMember>) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => (
      room.id === selectedRoom.id
        ? {
            ...room,
            members: room.members.map((member) => (member.connectionId === connectionId ? { ...member, ...patch } : member)),
            updatedAt: now,
          }
        : room
    )));
    if (patch.enabled === false) {
      setSelectedTargetIds((current) => current.filter((id) => id !== connectionId));
    }
  }

  function removeMemberFromSelectedRoom(member: RoomMember) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    if (selectedRoom.members.length <= 1) {
      showNotice('至少保留一个成员');
      return;
    }
    requestConfirm('移除成员', `将从「${selectedRoom.name}」移除 ${member.alias}。历史消息会保留。`, () => {
      const now = new Date().toISOString();
      setRooms((current) => current.map((room) => {
        if (room.id !== selectedRoom.id) return room;
        const sessionIds = { ...room.sessionIds };
        const memberSessionKeys = { ...(room.memberSessionKeys ?? {}) };
        delete sessionIds[member.connectionId];
        delete memberSessionKeys[member.connectionId];
        return {
          ...room,
          members: room.members.filter((item) => item.connectionId !== member.connectionId),
          sessionIds,
          memberSessionKeys,
          updatedAt: now,
        };
      }));
      setSelectedTargetIds((current) => current.filter((id) => id !== member.connectionId));
    });
  }

  function addMemberToSelectedRoom(connection: HermesConnection) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const now = new Date().toISOString();
    setRooms((current) => current.map((room) => {
      if (room.id !== selectedRoom.id || room.members.some((member) => member.connectionId === connection.id)) return room;
      return {
        ...room,
        members: [...room.members, { connectionId: connection.id, alias: connection.name, enabled: connection.enabled }],
        sessionIds: { ...room.sessionIds, [connection.id]: `laphiny-${room.id}-${connection.id}` },
        memberSessionKeys: { ...(room.memberSessionKeys ?? {}), [connection.id]: `laphiny-${room.id}-key` },
        updatedAt: now,
      };
    }));
  }

  function updateContextLimit(delta: number) {
    if (!selectedRoom) return;
    const currentLimit = selectedRoom.contextLimit ?? DEFAULT_CONTEXT_LIMIT;
    updateSelectedRoom({ contextLimit: Math.max(4, Math.min(80, currentLimit + delta)) });
  }

  function setRoomDefaultCollaborationMode(mode: Room['defaultCollaborationMode']) {
    updateSelectedRoom({ defaultCollaborationMode: mode });
  }

  function toggleRoomAutoDelegation() {
    if (!selectedRoom) return;
    updateSelectedRoom({ autoDelegationEnabled: selectedRoom.autoDelegationEnabled === false });
  }

  function updateRoomDelegationDepth(delta: number) {
    if (!selectedRoom) return;
    const next = Math.max(0, Math.min(6, (selectedRoom.maxDelegationDepth ?? MAX_DELEGATION_DEPTH) + delta));
    updateSelectedRoom({ maxDelegationDepth: next });
  }

  function setRoomSummaryConnection(connectionId?: string) {
    updateSelectedRoom({ summaryConnectionId: connectionId });
  }

  function saveSelectedRoomAsTeamTemplate() {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const name = teamTemplateName.trim() || `${selectedRoom.name} 模板`;
    const now = new Date().toISOString();
    const template: TeamTemplate = {
      id: makeId('team'),
      name,
      description: `由「${selectedRoom.name}」保存的 Soul 小队模板`,
      memberOrder: selectedRoom.members.map((member) => member.connectionId),
      defaultMode: selectedRoom.defaultCollaborationMode ?? 'manual',
      summaryConnectionId: selectedRoom.summaryConnectionId,
      autoDelegationEnabled: selectedRoom.autoDelegationEnabled !== false,
      maxDelegationDepth: selectedRoom.maxDelegationDepth ?? MAX_DELEGATION_DEPTH,
      createdAt: now,
      updatedAt: now,
    };
    setTeamTemplates((current) => [...current, template].slice(-50));
    appendCollaborationEvent({
      kind: 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '团队模板已保存',
      body: name,
    });
    showNotice('团队模板已保存', name);
  }

  function applyTeamTemplateToSelectedRoom(template: TeamTemplate) {
    if (!selectedRoom || selectedRoom.kind !== 'group') return;
    const memberById = new Map(selectedRoom.members.map((member) => [member.connectionId, member]));
    const orderedMembers = [
      ...template.memberOrder.map((id) => memberById.get(id)).filter((member): member is RoomMember => Boolean(member)),
      ...selectedRoom.members.filter((member) => !template.memberOrder.includes(member.connectionId)),
    ];
    updateSelectedRoom({
      members: orderedMembers,
      defaultCollaborationMode: template.defaultMode,
      summaryConnectionId: template.summaryConnectionId,
      autoDelegationEnabled: template.autoDelegationEnabled,
      maxDelegationDepth: template.maxDelegationDepth,
    });
    appendCollaborationEvent({
      kind: 'template_applied',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: 'Laphiny',
      title: '团队模板已应用',
      body: template.name,
    });
    showNotice('团队模板已应用', template.name);
  }

  function deleteTeamTemplate(template: TeamTemplate) {
    requestConfirm('删除团队模板', `将删除「${template.name}」。不会影响已有房间。`, () => {
      setTeamTemplates((current) => current.filter((item) => item.id !== template.id));
    });
  }

  function restoreProfileVersion(version: AgentProfileVersion) {
    setConnections((current) => current.map((connection) => (
      connection.id === version.connectionId
        ? { ...connection, profile: version.profile, updatedAt: new Date().toISOString() }
        : connection
    )));
    showNotice('协作卡片已回滚', version.connectionName);
  }

  function clearRoomMemoryCapsule() {
    if (!selectedRoom?.memoryCapsule) return;
    requestConfirm('清空房间记忆胶囊', '只会清空 Laphiny 的房间共享记忆，不会影响任何 Hermes Soul 的长期记忆。', () => {
      updateSelectedRoom({ memoryCapsule: undefined });
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: 'Laphiny',
        title: '房间记忆胶囊已清空',
        body: '用户清空了当前房间的共享记忆胶囊。',
      });
    });
  }

  function confirmPendingRoomMemoryCapsule() {
    if (!selectedRoom?.pendingMemoryCapsule) return;
    const now = new Date().toISOString();
    const capsule: RoomMemoryCapsule = {
      ...selectedRoom.pendingMemoryCapsule,
      updatedAt: now,
    };
    const growth = applyMemoryCapsuleToRoomGrowth(selectedRoom, capsule, now, makeId);
    updateSelectedRoom({
      ...growth,
      memoryCapsule: capsule,
      pendingMemoryCapsule: undefined,
    });
    appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, `房间记忆已确认并沉淀（v${capsule.version}）：\n${summarizeRoomMemory(capsule)}`)]);
    appendCollaborationEvent({
      kind: 'memory_updated',
      roomId: selectedRoom.id,
      roomName: selectedRoom.name,
      source: '用户',
      title: '房间记忆已确认沉淀',
      body: summarizeRoomMemory(capsule),
    });
    showNotice('记忆已沉淀', '知识库、协作黑板和决策记录已根据这次记忆同步更新。');
  }

  function discardPendingRoomMemoryCapsule() {
    if (!selectedRoom?.pendingMemoryCapsule) return;
    requestConfirm('丢弃记忆草案', '这只会丢弃当前待确认的房间记忆草案，不影响已确认记忆。', () => {
      updateSelectedRoom({ pendingMemoryCapsule: undefined });
      appendCollaborationEvent({
        kind: 'memory_updated',
        roomId: selectedRoom.id,
        roomName: selectedRoom.name,
        source: '用户',
        title: '房间记忆草案已丢弃',
      });
    });
  }

  function resetRoomSession() {
    if (!selectedRoom) return;
    requestConfirm('清空 Hermes 记忆', '将为当前房间生成新的 sessionKey，后续请求不会继续旧会话。', () => {
      updateSelectedRoom({
        sessionIds: {},
        sessionKey: `laphiny-${selectedRoom.id}-${Date.now().toString(36)}`,
      });
      appendMessagesToRoom(selectedRoom.id, [makeLocalNotice(selectedRoom.id, '已重置当前房间的 Hermes 会话。')]);
    });
  }

  function clearSelectedRoomMessages() {
    if (!selectedRoom) return;
    requestConfirm('清空本地记录', '这只会清空当前设备里的这个房间消息，不会删除连接配置。', () => {
      setMessagesByRoom((current) => ({
        ...current,
        [selectedRoom.id]: [],
      }));
    });
  }

  async function exportSelectedRoom(format: 'json' | 'markdown') {
    if (!selectedRoom) return;
    const messages = messagesByRoom[selectedRoom.id] ?? [];
    const text = format === 'json'
      ? JSON.stringify({ room: selectedRoom, messages }, null, 2)
      : buildMarkdownExport(selectedRoom, messages);

    await Clipboard.setStringAsync(text);
    showNotice(format === 'json' ? 'JSON 已复制' : 'Markdown 已复制', '当前房间记录已复制到剪贴板。');
  }

  return {
    blackboardDraft,
    decisionRationaleDraft,
    decisionTitleDraft,
    knowledgeBodyDraft,
    knowledgeTitleDraft,
    roomNameDraft,
    teamTemplateName,
    addMemberToSelectedRoom,
    addRoomBlackboardItem,
    addRoomDecisionRecord,
    addRoomKnowledgeItem,
    applyAgentRoomStatePatch,
    applyRoomMode,
    applyTeamTemplateToSelectedRoom,
    clearRoleplayArchive,
    clearRoomMemoryCapsule,
    clearSelectedRoomMessages,
    confirmPendingRoomMemoryCapsule,
    deleteSelectedRoom,
    deleteTeamTemplate,
    discardPendingRoomMemoryCapsule,
    exportSelectedRoom,
    removeMemberFromSelectedRoom,
    removeRoomBlackboardItem,
    removeRoomDecisionRecord,
    removeRoomKnowledgeItem,
    renameSelectedRoom,
    resetRoomSession,
    restoreProfileVersion,
    saveSelectedRoomAsTeamTemplate,
    setBlackboardDraft,
    setDecisionRationaleDraft,
    setDecisionTitleDraft,
    setKnowledgeBodyDraft,
    setKnowledgeTitleDraft,
    setRoomDefaultCollaborationMode,
    setRoomNameDraft,
    setRoomSummaryConnection,
    setTeamTemplateName,
    toggleRoomAutoDelegation,
    toggleSelectedRoomRoleplay,
    updateContextLimit,
    updateRoomBlackboardItemStatus,
    updateRoomById,
    updateRoomDecisionStatus,
    updateRoomDelegationDepth,
    updateSelectedRoom,
    updateSelectedRoomMember,
    updateSelectedRoomRoleplay,
  };
}
