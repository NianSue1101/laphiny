import { Room, RoomMember, TargetResolution } from '../types';

const MENTION_BOUNDARY = /[\s([{（【「『]/u;
const MENTION_END = /[\s,，:：;；、.!?！？)\]）】」』]/u;
const TASK_PREFIX = /^[,，:：;；、.!?！？\s]+/u;
const MIN_ASSISTANT_DELEGATION_TASK_LENGTH = 6;
const VAGUE_ASSISTANT_DELEGATION_TASKS = new Set([
  '看看',
  '看一下',
  '帮忙看看',
  '帮我看看',
  '处理一下',
  '继续',
  '补充',
  '补充一下',
]);

type KnownMention = {
  member?: RoomMember;
  mention: string;
  start: number;
  end: number;
  special?: 'all' | 'all-seq';
};

export interface AssistantDelegation {
  target: RoomMember;
  mention: string;
  taskText: string;
}

/**
 * Resolves only exact, boundary-delimited aliases/connection IDs. Unlike the
 * old token regex, aliases with spaces work and @Ann never accidentally selects
 * @Anna. The longest matching known name wins.
 */
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

  const knownMentions = scanKnownMentions(rawText, enabledMembers);
  const mentions = knownMentions.map((entry) => entry.mention);
  const allSequentialMentioned = knownMentions.some((entry) => entry.special === 'all-seq');
  const allMentioned = knownMentions.some((entry) => entry.special === 'all');
  const strippedText = stripMentionRanges(rawText, knownMentions);

  if (allSequentialMentioned) {
    return { targets: enabledMembers, mentions, strippedText, reason: 'all-seq' };
  }
  if (allMentioned) {
    return { targets: enabledMembers, mentions, strippedText, reason: 'all' };
  }

  const targets = uniqueMembers(knownMentions.flatMap((entry) => entry.member ? [entry.member] : []));
  return {
    targets,
    mentions,
    strippedText,
    reason: targets.length > 0 ? 'mentions' : 'none',
  };
}

export function memberMatchesMention(member: RoomMember, mention: string): boolean {
  const normalizedMention = normalizeMention(mention);
  return normalizeMention(member.alias) === normalizedMention || normalizeMention(member.connectionId) === normalizedMention;
}

export function normalizeMention(value: string): string {
  return value.trim().replace(/^[@＠]/u, '').toLocaleLowerCase();
}

/**
 * Assistant delegation is deliberately stricter than user routing: only a
 * line-leading exact @member plus an actionable task is forwarded.
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

  for (const line of assistantText.split(/\r?\n/u)) {
    const atIndex = getLineLeadingAtIndex(line);
    if (atIndex < 0) continue;
    const mention = resolveKnownMentionAt(line, atIndex, enabledMembers);
    if (!mention?.member) continue;

    const taskText = normalizeAssistantDelegationTask(line.slice(mention.end));
    if (!isActionableAssistantDelegationTask(taskText)) continue;

    const key = `${mention.member.connectionId}:${taskText}`;
    if (seen.has(key)) continue;
    seen.add(key);
    delegations.push({ target: mention.member, mention: mention.mention, taskText });
  }

  return delegations;
}

export function isActionableAssistantDelegationTask(taskText: string): boolean {
  const normalized = normalizeAssistantDelegationTask(taskText);
  if (normalized.length < MIN_ASSISTANT_DELEGATION_TASK_LENGTH) return false;
  if (VAGUE_ASSISTANT_DELEGATION_TASKS.has(normalized)) return false;
  return /[\p{L}\p{N}\u4e00-\u9fff]/u.test(normalized);
}

function scanKnownMentions(rawText: string, members: RoomMember[]): KnownMention[] {
  const found: KnownMention[] = [];
  for (let index = 0; index < rawText.length; index += 1) {
    if (rawText[index] !== '@' && rawText[index] !== '＠') continue;
    if (index > 0 && !MENTION_BOUNDARY.test(rawText[index - 1] ?? '')) continue;
    const mention = resolveKnownMentionAt(rawText, index, members);
    if (!mention) continue;
    found.push(mention);
    index = mention.end - 1;
  }
  return found;
}

function resolveKnownMentionAt(text: string, atIndex: number, members: RoomMember[]): KnownMention | null {
  const suffix = text.slice(atIndex + 1);
  const candidates: Array<{ value: string; member?: RoomMember; special?: 'all' | 'all-seq' }> = [
    { value: 'all-sequential', special: 'all-seq' as const },
    { value: 'all-seq', special: 'all-seq' as const },
    { value: 'all', special: 'all' as const },
    ...members.flatMap((member) => [
      { value: member.alias, member },
      { value: member.connectionId, member },
    ]),
  ].filter((candidate) => candidate.value.trim().length > 0)
    .sort((left, right) => right.value.length - left.value.length);

  const lowerSuffix = suffix.toLocaleLowerCase();
  for (const candidate of candidates) {
    const value = candidate.value.trim();
    if (!lowerSuffix.startsWith(value.toLocaleLowerCase())) continue;
    const next = suffix[value.length];
    if (next && !MENTION_END.test(next)) continue;
    return {
      member: candidate.member,
      mention: normalizeMention(value),
      start: atIndex,
      end: atIndex + 1 + value.length,
      special: candidate.special,
    };
  }
  return null;
}

function stripMentionRanges(rawText: string, mentions: KnownMention[]): string {
  let result = rawText;
  for (const mention of [...mentions].reverse()) {
    let end = mention.end;
    if (/[,，:：;；、.!?！？]/u.test(result[end] ?? '')) end += 1;
    while (/\s/u.test(result[end] ?? '')) end += 1;
    result = `${result.slice(0, mention.start)}${result.slice(end)}`;
  }
  return result.replace(/\s{2,}/gu, ' ').trim();
}

function getLineLeadingAtIndex(line: string): number {
  const match = line.match(/^[\t >*\-•]*[@＠]/u);
  return match ? match[0].length - 1 : -1;
}

function normalizeAssistantDelegationTask(taskText: string): string {
  return taskText.replace(TASK_PREFIX, '').replace(/\s+/gu, ' ').trim();
}

function uniqueMembers(members: RoomMember[]): RoomMember[] {
  const seen = new Set<string>();
  return members.filter((member) => {
    if (seen.has(member.connectionId)) return false;
    seen.add(member.connectionId);
    return true;
  });
}

/** Compatibility helper for callers that only need the delegation targets. */
export function resolveAssistantMentions(
  room: Room,
  assistantText: string,
  excludeConnectionId: string,
): TargetResolution {
  const delegations = resolveAssistantDelegations(room, assistantText, excludeConnectionId);
  return {
    targets: uniqueMembers(delegations.map((delegation) => delegation.target)),
    mentions: delegations.map((delegation) => delegation.mention),
    strippedText: assistantText,
    reason: delegations.length ? 'mentions' : 'none',
  };
}
