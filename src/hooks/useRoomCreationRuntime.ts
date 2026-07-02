import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

import { getErrorMessage, makeRoom, showNotice } from '../app/app_utils';
import { pickDocuments, pickImages } from '../lib/attachments';
import { makeDefaultRoleplayConfig } from '../lib/roleplay';
import { type StarterRoomTemplate, getRoomModeDefinition, makeDefaultRoleplayArchive } from '../lib/stage4_plus';
import type { Attachment, CollaborationEvent, HermesConnection, RoleplayConfig, Room, RoomMember } from '../types';

type CollaborationEventInput = Omit<CollaborationEvent, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

type UseRoomCreationRuntimeOptions = {
  enabledConnections: HermesConnection[];
  rooms: Room[];
  setPendingAttachments: Dispatch<SetStateAction<Attachment[]>>;
  setRooms: Dispatch<SetStateAction<Room[]>>;
  appendCollaborationEvent: (input: CollaborationEventInput) => void;
  openFocusedChatRoom: (roomId: string) => void;
};

export function useRoomCreationRuntime({
  enabledConnections,
  rooms,
  setPendingAttachments,
  setRooms,
  appendCollaborationEvent,
  openFocusedChatRoom,
}: UseRoomCreationRuntimeOptions) {
  const [groupMemberDraftIds, setGroupMemberDraftIds] = useState<string[]>([]);
  const [groupName, setGroupName] = useState('Hermes 群聊');

  useEffect(() => {
    const enabledIds = enabledConnections.map((connection) => connection.id);
    setGroupMemberDraftIds((current) => {
      const kept = current.filter((id) => enabledIds.includes(id));
      return kept.length > 0 ? kept : enabledIds;
    });
  }, [enabledConnections]);

  function createDirectRoom(connection: HermesConnection) {
    const existing = rooms.find((room) => room.kind === 'direct' && room.members[0]?.connectionId === connection.id);
    if (existing) {
      openFocusedChatRoom(existing.id);
      return;
    }

    const room = makeRoom(connection.name, 'direct', [{ connectionId: connection.id, alias: connection.name, enabled: true }]);
    setRooms((current) => [...current, room]);
    openFocusedChatRoom(room.id);
  }

  function createGroupRoom() {
    const selectedConnections = enabledConnections.filter((connection) => groupMemberDraftIds.includes(connection.id));
    const members = selectedConnections.map<RoomMember>((connection) => ({
      connectionId: connection.id,
      alias: connection.name,
      enabled: true,
    }));

    if (members.length < 2) {
      showNotice('群聊至少需要两个已启用 Hermes 连接');
      return;
    }

    const baseRoom = makeRoom(groupName.trim() || 'Hermes 群聊', 'group', members);
    const room: Room = { ...baseRoom, mode: 'studio' };
    setRooms((current) => [...current, room]);
    openFocusedChatRoom(room.id);
    setGroupMemberDraftIds(enabledConnections.map((connection) => connection.id));
  }

  function createStarterRoom(template: StarterRoomTemplate) {
    const members = enabledConnections.slice(0, Math.max(template.minimumConnections, 1)).map<RoomMember>((connection) => ({
      connectionId: connection.id,
      alias: connection.name,
      enabled: true,
    }));
    if (members.length < template.minimumConnections) {
      showNotice('连接不足', `${template.title} 至少需要 ${template.minimumConnections} 个已启用连接。`);
      return;
    }
    const definition = getRoomModeDefinition(template.mode);
    const room = makeRoom(template.roomName, members.length > 1 ? 'group' : 'direct', members);
    const gm = members[0];
    const roleplay = definition.roleplayEnabled ? {
      ...makeDefaultRoleplayConfig(gm?.connectionId),
      ...template.roleplay,
      enabled: true,
      gmConnectionId: gm?.connectionId,
      playerName: template.roleplay?.playerName ?? '玩家',
      archive: makeDefaultRoleplayArchive(template.roomName, { ...makeDefaultRoleplayConfig(gm?.connectionId), ...template.roleplay, enabled: true } as RoleplayConfig),
      updatedAt: new Date().toISOString(),
    } : undefined;
    const nextRoom: Room = {
      ...room,
      mode: template.mode,
      defaultCollaborationMode: definition.defaultCollaborationMode,
      autoDelegationEnabled: definition.autoDelegationEnabled,
      roleplay,
    };
    setRooms((current) => [...current, nextRoom]);
    openFocusedChatRoom(nextRoom.id);
    appendCollaborationEvent({
      kind: definition.roleplayEnabled ? 'roleplay_started' : 'template_applied',
      roomId: nextRoom.id,
      roomName: nextRoom.name,
      source: 'Laphiny',
      title: `已创建${template.title}`,
      body: template.description,
    });
  }

  async function attachImages() {
    try {
      const images = await pickImages();
      setPendingAttachments((current) => [...current, ...images]);
    } catch (error) {
      showNotice('选择图片失败', getErrorMessage(error));
    }
  }

  async function attachDocuments() {
    try {
      const documents = await pickDocuments();
      setPendingAttachments((current) => [...current, ...documents]);
    } catch (error) {
      showNotice('选择文件失败', getErrorMessage(error));
    }
  }

  return {
    groupMemberDraftIds,
    groupName,
    attachDocuments,
    attachImages,
    createDirectRoom,
    createGroupRoom,
    createStarterRoom,
    setGroupMemberDraftIds,
    setGroupName,
  };
}
