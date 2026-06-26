import { Room, RoomMember, TargetResolution } from '../types';

const MENTION_TOKEN = String.raw`[\p{L}\p{N}_\-.\u4e00-\u9fff]+`;
const USER_MENTION_PATTERN = new RegExp(
  String.raw`(^|[\s([{（【「『])[@＠](${MENTION_TOKEN})(?=$|[\s,，:：;；、.!?！？)\]）】」』])([,，:：;；、.!?！？]?\s*)?`,
  'giu',
);
const ASSISTANT_DELEGATION_PATTERN = new RegExp(
  String.raw`(^|\n)[\t >*\-•]*[@＠](${MENTION_TOKEN})(?=$|[\s,，:：;；、.!?！？])([,，:：;；、.!?！？]?\s*)([^\n]*)`,
  'giu',
);

export interface AssistantDelegation {
  target: RoomMember;
  mention: string;
  taskText: string;
}

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
  let allSequentialMentioned = false;
  const strippedText = rawText.replace(USER_MENTION_PATTERN, (full, leading: string, mention: string) => {
    const normalized = normalizeMention(mention);
    mentions.push(normalized);
    if (normalized === 'all') {
      allMentioned = true;
    }
    if (normalized === 'all-seq' || normalized === 'all-sequential') {
      allSequentialMentioned = true;
    }
    return leading || '';
  }).replace(/\s{2,}/g, ' ').trim();

  if (allSequentialMentioned) {
    return {
      targets: enabledMembers,
      mentions,
      strippedText,
      reason: 'all-seq',
    };
  }

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
 * 解析 assistant 回复中用于委托的行首 @提及。
 * 只有单独一行开头的 @成员 才会触发自动转发，降低普通文本误触发概率。
 */
export function resolveAssistantDelegations(
  room: Room,
  assistantText: string,
  excludeConnectionId: string,
): AssistantDelegation[] {
  const enabledMembers = room.members.filter(
    (member) => member.enabled && member.connectionId !== excludeConnectionId,
  );
  const delegations: AssistantDelegation[] = [];
  const seen = new Set<string>();

  for (const match of assistantText.matchAll(ASSISTANT_DELEGATION_PATTERN)) {
    const mention = normalizeMention(match[2] ?? '');
    if (!mention || mention === 'all' || mention === 'all-seq' || mention === 'all-sequential') {
      continue;
    }

    const targets = enabledMembers.filter((member) => memberMatchesMention(member, mention));
    const taskText = (match[4] ?? '').trim();
    for (const target of targets) {
      const key = `${target.connectionId}:${taskText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      delegations.push({ target, mention, taskText });
    }
  }

  return delegations;
}

/**
 * 兼容旧调用：解析 assistant 回复中的 @提及，找出被委托的成员。
 * 新逻辑只接受行首 @，推荐新代码使用 resolveAssistantDelegations 获取逐成员任务。
 */
export function resolveAssistantMentions(
  room: Room,
  assistantText: string,
  excludeConnectionId: string,
): TargetResolution {
  const delegations = resolveAssistantDelegations(room, assistantText, excludeConnectionId);
  const mentions = delegations.map((delegation) => delegation.mention);
  const targets = uniqueMembers(delegations.map((delegation) => delegation.target));
  const strippedText = assistantText
    .replace(ASSISTANT_DELEGATION_PATTERN, (full, leading: string, mention: string, separator: string, rest: string) => `${leading}${rest ?? ''}`)
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    targets,
    mentions,
    strippedText,
    reason: targets.length > 0 ? 'mentions' : 'none',
  };
}
