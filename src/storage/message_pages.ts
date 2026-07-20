import type { ChatMessage } from '../types';

export const MESSAGE_PAGE_SIZE = 20;
export const MESSAGE_INITIAL_PAGE_COUNT = 1;

export type MessageRoomPageIndex = {
  pageCount: number;
  messageCount: number;
};

export type MessagePagesIndex = {
  version: 2;
  /** Page size the stored pages were written with. Missing means a pre-0.36.1 index. */
  pageSize?: number;
  rooms: Record<string, MessageRoomPageIndex>;
};

export type MessageHistoryInfo = {
  totalCount: number;
  nextOlderPage: number;
};

export type MessageIndexRecoveryDecision =
  | { source: 'primary' | 'backup'; index: MessagePagesIndex }
  | { source: 'legacy'; messages: Record<string, ChatMessage[]> }
  | { source: 'empty'; index: MessagePagesIndex }
  | { source: 'error' };

export function splitMessagePages(messages: ChatMessage[], pageSize = MESSAGE_PAGE_SIZE): ChatMessage[][] {
  const pages: ChatMessage[][] = [];
  for (let offset = 0; offset < messages.length; offset += pageSize) {
    pages.push(messages.slice(offset, offset + pageSize));
  }
  return pages;
}

export function getInitialPageStart(pageCount: number, initialPageCount = MESSAGE_INITIAL_PAGE_COUNT): number {
  return Math.max(0, pageCount - initialPageCount);
}

/**
 * True when the stored pages were written with a different page size and must
 * be re-split before the paged window logic can rely on uniform pages.
 */
export function needsMessagePageRepack(index: MessagePagesIndex, pageSize = MESSAGE_PAGE_SIZE): boolean {
  return index.pageSize !== pageSize;
}

/**
 * Start page of the initial read window. Always covers whole pages and at
 * least `minFill` messages when available, so a room whose last page holds
 * only a few messages still opens with a usable window. Page lengths are
 * derived from the uniform page size, which is guaranteed after repack.
 */
export function getInitialPageStartWithMinFill({
  pageCount,
  messageCount,
  pageSize = MESSAGE_PAGE_SIZE,
  minFill = MESSAGE_PAGE_SIZE * MESSAGE_INITIAL_PAGE_COUNT,
}: {
  pageCount: number;
  messageCount: number;
  pageSize?: number;
  minFill?: number;
}): number {
  let start = getInitialPageStart(pageCount);
  if (pageCount === 0 || start === 0) return start;
  let filled = Math.max(0, messageCount - pageSize * (pageCount - 1));
  while (filled < minFill && start > 0) {
    start -= 1;
    filled += pageSize;
  }
  return start;
}

export function getMessageRewriteStart(current: ChatMessage[], previousStart: number): number {
  return current.length === 0 ? 0 : previousStart;
}

export function prependMessagePage(current: ChatMessage[], olderPage: ChatMessage[]): ChatMessage[] {
  const currentIds = new Set(current.map((message) => message.id));
  return [...olderPage.filter((message) => !currentIds.has(message.id)), ...current];
}

/**
 * Applies a freshly reloaded paged window without clobbering local changes
 * that happened while the window was being persisted and reloaded. Messages
 * present in `latest` but not in `base` (e.g. a just-sent message) are kept;
 * rooms cleared locally in the meantime stay cleared.
 */
export function reconcileWindowedMessagesByRoom({
  latest,
  base,
  windowed,
}: {
  latest: Record<string, ChatMessage[]>;
  base: Record<string, ChatMessage[]>;
  windowed: Record<string, ChatMessage[]>;
}): Record<string, ChatMessage[]> {
  const result: Record<string, ChatMessage[]> = {};
  for (const roomId of Object.keys(latest)) {
    const baseIds = new Set((base[roomId] ?? []).map((message) => message.id));
    const extras = (latest[roomId] ?? []).filter((message) => !baseIds.has(message.id));
    const windowedMessages = windowed[roomId] ?? [];
    result[roomId] = extras.length === 0
      ? windowedMessages
      : [...windowedMessages, ...extras].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return result;
}

export function isMessagePagesIndex(value: unknown): value is MessagePagesIndex {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.version !== 2 || !record.rooms || typeof record.rooms !== 'object' || Array.isArray(record.rooms)) return false;
  if (record.pageSize !== undefined && (!Number.isInteger(record.pageSize) || Number(record.pageSize) <= 0)) return false;
  return Object.values(record.rooms as Record<string, unknown>).every((roomValue) => {
    if (!roomValue || typeof roomValue !== 'object') return false;
    const room = roomValue as Record<string, unknown>;
    return Number.isInteger(room.pageCount)
      && Number(room.pageCount) >= 0
      && Number.isInteger(room.messageCount)
      && Number(room.messageCount) >= 0
      && (Number(room.pageCount) > 0 || Number(room.messageCount) === 0);
  });
}

export function decideMessageIndexRecovery({
  primary,
  backup,
  legacy,
  primaryExists,
  legacyExists,
}: {
  primary: unknown;
  backup: unknown;
  legacy: unknown;
  primaryExists: boolean;
  legacyExists: boolean;
}): MessageIndexRecoveryDecision {
  if (isMessagePagesIndex(primary)) return { source: 'primary', index: primary };
  if (isMessagePagesIndex(backup)) return { source: 'backup', index: backup };
  if (isMessageRecord(legacy) && (Object.keys(legacy).length > 0 || !primaryExists)) {
    return { source: 'legacy', messages: legacy };
  }
  if (!primaryExists && !legacyExists) return { source: 'empty', index: { version: 2, rooms: {} } };
  return { source: 'error' };
}

/**
 * Returns the portion that must be written back after the UI changes a room.
 * When a user merely opened older pages, their current list ends in the stored
 * tail unchanged; persisting it would rewrite (and duplicate) old history.
 */
export function getChangedMessageTail(current: ChatMessage[], storedTail: ChatMessage[]): ChatMessage[] | null {
  if (current.length === 0) return [];
  if (storedTail.length === 0) return current;

  const currentTailIds = current.slice(-storedTail.length).map((message) => message.id);
  const storedTailIds = storedTail.map((message) => message.id);
  if (current.length > storedTail.length && sameIds(currentTailIds, storedTailIds)) {
    return null;
  }

  const tailStart = current.findIndex((message) => message.id === storedTail[0]?.id);
  return tailStart >= 0 ? current.slice(tailStart) : current;
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function isMessageRecord(value: unknown): value is Record<string, ChatMessage[]> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((messages) => Array.isArray(messages)));
}
