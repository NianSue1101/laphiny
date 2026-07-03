import type { HermesConnection, Room, RoomMember } from '../types';
import {
  buildRitualPrompt,
  getRitualTargets,
  parseCollaborationRitualCommand,
  type ParsedCollaborationRitual,
} from './collaboration_rituals';
import { buildGoalModePrompt, parseGoalCommand, type GoalModeCommand } from './goal_mode';
import { resolveMentionTargets } from './mentions';
import { buildRoleplayTurnPrompt, getRoleplayTargets, isRoleplayUserTurn } from './roleplay';

export type CollaborationMode = 'parallel' | 'sequential';

export type SendTargetSelection = {
  targets: RoomMember[];
  textForHermes: string;
  mode: CollaborationMode;
  ritual?: ParsedCollaborationRitual;
  goalMode?: GoalModeCommand;
};

export function getSendTargets({
  room,
  rawText,
  explicitTargetIds,
  connections,
}: {
  room: Room;
  rawText: string;
  explicitTargetIds: string[];
  connections: HermesConnection[];
}): SendTargetSelection {
  const goalMode = parseGoalCommand(rawText);
  if (goalMode) {
    const resolution = resolveMentionTargets(room, rawText);
    const explicitTargetSet = new Set(explicitTargetIds);
    const manuallySelectedTargets = room.members.filter((member) => (
      member.enabled && explicitTargetSet.has(member.connectionId)
    ));
    const summaryTarget = room.members.find((member) => member.enabled && member.connectionId === room.summaryConnectionId);
    const strippedGoal = parseGoalCommand(resolution.strippedText)?.goal.trim();
    const promptGoal = strippedGoal || goalMode.goal;
    const commandLead = goalMode.leadMention
      ? room.members.find((member) => member.enabled && (
        member.alias.toLowerCase() === goalMode.leadMention?.toLowerCase()
        || member.connectionId.toLowerCase() === goalMode.leadMention?.toLowerCase()
      ))
      : undefined;
    const leadMember = commandLead
      ?? manuallySelectedTargets[0]
      ?? resolution.targets[0]
      ?? summaryTarget
      ?? room.members.find((member) => member.enabled);
    const normalizedGoalMode = { ...goalMode, goal: promptGoal };

    return {
      targets: leadMember ? [leadMember] : [],
      textForHermes: leadMember
        ? buildGoalModePrompt({ goal: promptGoal, room, leadMember, connections })
        : promptGoal,
      mode: 'sequential',
      goalMode: normalizedGoalMode,
    };
  }

  const ritual = room.kind === 'group' ? parseCollaborationRitualCommand(rawText) : null;
  if (ritual) {
    return {
      targets: getRitualTargets(room),
      textForHermes: buildRitualPrompt(ritual, room),
      mode: ritual.definition.mode,
      ritual,
    };
  }

  const resolution = resolveMentionTargets(room, rawText);
  const explicitTargetSet = new Set(explicitTargetIds);
  const manuallySelectedTargets = room.members.filter((member) => (
    member.enabled && explicitTargetSet.has(member.connectionId)
  ));
  const textForHermes = resolution.strippedText || rawText;

  if (
    room.kind === 'group'
    && isRoleplayUserTurn(room, rawText)
    && manuallySelectedTargets.length === 0
    && resolution.targets.length === 0
  ) {
    return {
      targets: getRoleplayTargets(room),
      textForHermes: buildRoleplayTurnPrompt(room, rawText),
      mode: 'sequential',
    };
  }

  if (room.kind === 'group' && manuallySelectedTargets.length > 0) {
    return {
      targets: manuallySelectedTargets,
      textForHermes,
      mode: resolution.reason === 'all-seq' || room.defaultCollaborationMode === 'sequential' ? 'sequential' : 'parallel',
    };
  }

  if (room.kind === 'group' && resolution.targets.length === 0 && room.defaultCollaborationMode && room.defaultCollaborationMode !== 'manual') {
    return {
      targets: room.members.filter((member) => member.enabled),
      textForHermes,
      mode: room.defaultCollaborationMode === 'sequential' ? 'sequential' : 'parallel',
    };
  }

  return {
    targets: resolution.targets,
    textForHermes,
    mode: resolution.reason === 'all-seq' ? 'sequential' : 'parallel',
  };
}
