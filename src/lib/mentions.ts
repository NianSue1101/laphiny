import { Room, RoomMember, TargetResolution } from '../types';

const MENTION_BOUNDARY = /[\s([{（【「『,，:：;；、.!?！？"“”'‘’]/u;
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
  ambiguousMembers?: RoomMember[];
};

export interface AssistantDelegation {
  target: RoomMember;
  mention: string;
  taskText: string;
  input?: string;
  deliverable?: string;
  acceptance?: string;
  priority?: 'low' | 'normal' | 'high';
}

type DelegationPayload = {
  to?: unknown;
  task?: unknown;
};

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
  const ambiguousMentions = knownMentions.flatMap((entry) => entry.ambiguousMembers?.length ? [{
    mention: entry.mention,
    candidateConnectionIds: entry.ambiguousMembers.map((member) => member.connectionId),
  }] : []);

  if (ambiguousMentions.length > 0) {
    return { targets: [], mentions, ambiguousMentions, strippedText, reason: 'ambiguous' };
  }

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

/** Resolves the validated arguments emitted by the Hermes plugin tool call. */
export function resolveAssistantToolDelegations(
  room: Room,
  toolCalls: Array<{ name: string; arguments: string }> | undefined,
  excludeConnectionId: string,
): AssistantDelegation[] {
  const members = room.members.filter((member) => member.enabled && member.connectionId !== excludeConnectionId);
  const result: AssistantDelegation[] = [];
  const seen = new Set<string>();
  for (const call of toolCalls ?? []) {
    if (call.name !== 'laphiny_delegate_tasks') continue;
    try {
      const payload = JSON.parse(call.arguments) as { tasks?: unknown };
      if (!Array.isArray(payload.tasks)) continue;
      for (const item of payload.tasks) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const task = item as Record<string, unknown>;
        const assigneeId = typeof task.assignee_id === 'string' ? task.assignee_id.trim() : '';
        const taskText = typeof task.task === 'string' ? normalizeAssistantDelegationTask(task.task) : '';
        const deliverable = typeof task.deliverable === 'string' ? normalizeAssistantDelegationTask(task.deliverable) : '';
        const acceptance = typeof task.acceptance === 'string' ? normalizeAssistantDelegationTask(task.acceptance) : '';
        const target = members.find((member) => member.connectionId === assigneeId);
        if (!target || !isActionableAssistantDelegationTask(taskText) || !deliverable || !acceptance) continue;
        const key = `${target.connectionId}:${taskText}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({
          target,
          mention: normalizeMention(assigneeId),
          taskText,
          input: typeof task.input === 'string' ? normalizeAssistantDelegationTask(task.input) : undefined,
          deliverable,
          acceptance,
          priority: task.priority === 'low' || task.priority === 'high' ? task.priority : 'normal',
        });
      }
    } catch {
      // A malformed tool call is not executable; the regular reply remains visible.
    }
  }
  return result;
}

export function memberMatchesMention(member: RoomMember, mention: string): boolean {
  const normalizedMention = normalizeMention(mention);
  return normalizeMention(member.alias) === normalizedMention || normalizeMention(member.connectionId) === normalizedMention;
}

export function normalizeMention(value: string): string {
  return value.trim().replace(/^[@＠]/u, '').normalize('NFKC').toLocaleLowerCase();
}

/**
 * Assistant delegation prefers the explicit laphiny-delegation JSON protocol.
 * The line-leading @ form remains as a backward-compatible fallback.
 */
export function resolveAssistantDelegations(
  room: Room,
  assistantText: string,
  excludeConnectionId: string,
): AssistantDelegation[] {
  const enabledMembers = room.members.filter(
    (member) => member.enabled && member.connectionId !== excludeConnectionId,
  );
  const structured = resolveStructuredAssistantDelegations(assistantText, enabledMembers);
  if (structured.length > 0) return structured;

  const delegations: AssistantDelegation[] = [];
  const seen = new Set<string>();

  let insideFence = false;
  for (const line of assistantText.split(/\r?\n/u)) {
    if (/^\s*```/u.test(line)) {
      insideFence = !insideFence;
      continue;
    }
    if (insideFence || /^\s*>/u.test(line)) continue;
    const atIndex = getLineLeadingAtIndex(line);
    if (atIndex < 0) continue;
    const mentions = resolveLeadingDelegationMentions(line, atIndex, enabledMembers);
    if (mentions.length === 0) continue;
    const taskText = normalizeAssistantDelegationTask(line.slice(mentions.at(-1)!.end));
    if (!isActionableAssistantDelegationTask(taskText)) continue;

    for (const mention of mentions) {
      const key = `${mention.member!.connectionId}:${taskText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      delegations.push({ target: mention.member!, mention: mention.mention, taskText });
    }
  }

  return delegations;
}

/**
 * Parses a machine-readable delegation block. Each entry owns one task, which
 * avoids guessing how prose after several consecutive mentions should split.
 */
function resolveStructuredAssistantDelegations(text: string, members: RoomMember[]): AssistantDelegation[] {
  const delegations: AssistantDelegation[] = [];
  const seen = new Set<string>();
  const blockPattern = /```laphiny-delegation\s*\n([\s\S]*?)```/gi;
  let block: RegExpExecArray | null;
  while ((block = blockPattern.exec(text)) !== null) {
    let payload: unknown;
    try {
      payload = JSON.parse(block[1] ?? '');
    } catch {
      continue;
    }
    if (!Array.isArray(payload)) continue;
    for (const item of payload) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const { to, task } = item as DelegationPayload;
      const targetName = typeof to === 'string' ? to.trim() : '';
      const taskText = typeof task === 'string' ? normalizeAssistantDelegationTask(task) : '';
      if (!targetName || !isActionableAssistantDelegationTask(taskText)) continue;
      const candidates = uniqueMembers(members.filter((member) => memberMatchesMention(member, targetName)));
      if (candidates.length !== 1) continue;
      const target = candidates[0]!;
      const key = `${target.connectionId}:${taskText}`;
      if (seen.has(key)) continue;
      seen.add(key);
      delegations.push({ target, mention: normalizeMention(targetName), taskText });
    }
  }
  return delegations;
}

function resolveLeadingDelegationMentions(line: string, start: number, members: RoomMember[]): KnownMention[] {
  const mentions: KnownMention[] = [];
  let offset = start;
  while (offset >= 0) {
    const mention = resolveKnownMentionAt(line, offset, members);
    if (!mention?.member) break;
    mentions.push(mention);
    const rest = line.slice(mention.end);
    const next = rest.match(/^[\s,，、]+[@＠]/u);
    if (!next) break;
    offset = mention.end + next[0].length - 1;
  }
  return mentions;
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

  const lowerSuffix = suffix.normalize('NFKC').toLocaleLowerCase();
  const matches = candidates.filter((candidate) => {
    const value = candidate.value.trim();
    if (!lowerSuffix.startsWith(value.normalize('NFKC').toLocaleLowerCase())) return false;
    const next = suffix[value.length];
    return !next || MENTION_END.test(next);
  });
  if (matches.length === 0) return null;
  const longestLength = matches[0]!.value.trim().length;
  const longestMatches = matches.filter((candidate) => candidate.value.trim().length === longestLength);
  const special = longestMatches.find((candidate) => candidate.special);
  const value = (special ?? longestMatches[0])!.value.trim();
  const matchingMembers = uniqueMembers(longestMatches.flatMap((candidate) => candidate.member ? [candidate.member] : []));
  return {
    member: special ? undefined : matchingMembers.length === 1 ? matchingMembers[0] : undefined,
    mention: normalizeMention(value),
    start: atIndex,
    end: atIndex + 1 + value.length,
    special: special?.special,
    ambiguousMembers: !special && matchingMembers.length > 1 ? matchingMembers : undefined,
  };
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
  const match = line.match(/^[\t *\-•]*[@＠]/u);
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
