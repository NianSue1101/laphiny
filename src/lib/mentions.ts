import { Room, RoomMember, TargetResolution } from '../types';

const MENTION_PATTERN = /(^|\s)[@＠]([\p{L}\p{N}_\-.\u4e00-\u9fff]+|all)(?=\s|$)/giu;

export function resolveMentionTargets(room: Room, rawText: string): TargetResolution {
  const enabledMembers = room.members.filter((member) => member.enabled);

  if (room.kind === 'direct') {
    return {
      targets: enabledMembers.slice(0, 1),
      mentions: [],
      strippedText: rawText.trim(),
      reason: 'direct',
    };
  }

  const mentions: string[] = [];
  let allMentioned = false;
  const strippedText = rawText.replace(MENTION_PATTERN, (full, leading: string, mention: string) => {
    const normalized = normalizeMention(mention);
    mentions.push(normalized);
    if (normalized === 'all') {
      allMentioned = true;
    }
    return leading || '';
  }).replace(/\s{2,}/g, ' ').trim();

  if (allMentioned) {
    return {
      targets: enabledMembers,
      mentions,
      strippedText,
      reason: 'all',
    };
  }

  const targets = uniqueMembers(
    mentions.flatMap((mention) => enabledMembers.filter((member) => memberMatchesMention(member, mention))),
  );

  if (targets.length === 0) {
    return {
      targets: [],
      mentions,
      strippedText,
      reason: 'none',
    };
  }

  return {
    targets,
    mentions,
    strippedText,
    reason: 'mentions',
  };
}

export function memberMatchesMention(member: RoomMember, mention: string): boolean {
  const normalizedMention = normalizeMention(mention);
  return normalizeMention(member.alias) === normalizedMention || normalizeMention(member.connectionId) === normalizedMention;
}

export function normalizeMention(value: string): string {
  return value.trim().replace(/^[@＠]/, '').toLowerCase();
}

function uniqueMembers(members: RoomMember[]): RoomMember[] {
  const seen = new Set<string>();
  const result: RoomMember[] = [];

  for (const member of members) {
    if (seen.has(member.connectionId)) {
      continue;
    }
    seen.add(member.connectionId);
    result.push(member);
  }

  return result;
}

/**
 * 解析 assistant 回复中的 @提及，找出被委托的成员。
 * 用于自动转发：agent A 在回复中 @了 agent B，Laphiny 自动把消息转发给 B。
 *
 * @param room 当前房间
 * @param assistantText assistant 回复的文本内容
 * @param excludeConnectionId 排除此 connectionId（防止 agent @自己造成循环）
 */
export function resolveAssistantMentions(
  room: Room,
  assistantText: string,
  excludeConnectionId: string,
): TargetResolution {
  const enabledMembers = room.members.filter(
    (member) => member.enabled && member.connectionId !== excludeConnectionId,
  );

  const mentions: string[] = [];
  const strippedText = assistantText
    .replace(MENTION_PATTERN, (full, leading: string, mention: string) => {
      const normalized = normalizeMention(mention);
      mentions.push(normalized);
      return leading || '';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (mentions.length === 0) {
    return { targets: [], mentions, strippedText, reason: 'none' };
  }

  const targets = uniqueMembers(
    mentions.flatMap((mention) =>
      enabledMembers.filter((member) => memberMatchesMention(member, mention)),
    ),
  );

  return {
    targets,
    mentions,
    strippedText,
    reason: targets.length > 0 ? 'mentions' : 'none',
  };
}
