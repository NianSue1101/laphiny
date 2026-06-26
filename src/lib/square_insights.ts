import { ChatMessage, CollaborationEvent, DelegationTask, HermesConnection, Room } from '../types';

export interface SoulDailyAgentStat {
  connectionId: string;
  name: string;
  replies: number;
  delegatedOut: number;
  delegatedIn: number;
  completedTasks: number;
  profileUpdated: boolean;
}

export interface SoulDailyDigest {
  since: string;
  messages: number;
  agentReplies: number;
  userMessages: number;
  collaborationEvents: number;
  delegations: number;
  completedDelegations: number;
  pendingDelegations: number;
  summaries: number;
  memoryRooms: number;
  activeRooms: Array<{ roomId: string; roomName: string; messages: number; collaborations: number }>;
  agentStats: SoulDailyAgentStat[];
}

export function buildSoulDailyDigest({
  rooms,
  connections,
  messagesByRoom,
  collaborationEvents,
  delegationTasks,
}: {
  rooms: Room[];
  connections: HermesConnection[];
  messagesByRoom: Record<string, ChatMessage[]>;
  collaborationEvents: CollaborationEvent[];
  delegationTasks: DelegationTask[];
}): SoulDailyDigest {
  const since = startOfLocalDayIso();
  const todayMessages = Object.values(messagesByRoom).flat().filter((message) => message.createdAt >= since);
  const todayEvents = collaborationEvents.filter((event) => event.createdAt >= since);
  const todayTasks = delegationTasks.filter((task) => task.createdAt >= since || task.updatedAt >= since);
  const roomStats = rooms.map((room) => ({
    roomId: room.id,
    roomName: room.name,
    messages: (messagesByRoom[room.id] ?? []).filter((message) => message.createdAt >= since).length,
    collaborations: todayEvents.filter((event) => event.roomId === room.id).length,
  })).filter((item) => item.messages > 0 || item.collaborations > 0)
    .sort((a, b) => (b.messages + b.collaborations) - (a.messages + a.collaborations))
    .slice(0, 6);

  const agentStats = connections.map((connection) => {
    const aliases = new Set<string>([connection.name]);
    for (const room of rooms) {
      const member = room.members.find((item) => item.connectionId === connection.id);
      if (member) aliases.add(member.alias);
    }
    const messages = todayMessages.filter((message) => message.authorId === connection.id || aliases.has(message.authorName));
    return {
      connectionId: connection.id,
      name: connection.name,
      replies: messages.filter((message) => message.role === 'assistant').length,
      delegatedOut: todayTasks.filter((task) => task.fromConnectionId === connection.id || aliases.has(task.fromAlias)).length,
      delegatedIn: todayTasks.filter((task) => task.toConnectionId === connection.id || aliases.has(task.toAlias)).length,
      completedTasks: todayTasks.filter((task) => (task.toConnectionId === connection.id || aliases.has(task.toAlias)) && task.status === 'done').length,
      profileUpdated: Boolean(connection.profile?.updatedAt && connection.profile.updatedAt >= since),
    };
  }).filter((stat) => stat.replies || stat.delegatedOut || stat.delegatedIn || stat.completedTasks || stat.profileUpdated)
    .sort((a, b) => (b.replies + b.completedTasks + b.delegatedIn) - (a.replies + a.completedTasks + a.delegatedIn));

  return {
    since,
    messages: todayMessages.length,
    agentReplies: todayMessages.filter((message) => message.role === 'assistant').length,
    userMessages: todayMessages.filter((message) => message.authorId === 'user').length,
    collaborationEvents: todayEvents.length,
    delegations: todayTasks.length,
    completedDelegations: todayTasks.filter((task) => task.status === 'done').length,
    pendingDelegations: delegationTasks.filter((task) => task.status === 'pending' || task.status === 'running').length,
    summaries: todayEvents.filter((event) => event.kind === 'summary_created').length,
    memoryRooms: rooms.filter((room) => room.memoryCapsule).length,
    activeRooms: roomStats,
    agentStats,
  };
}

function startOfLocalDayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}
