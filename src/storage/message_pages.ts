import type { ChatMessage } from '../types';

export const MESSAGE_PAGE_SIZE = 100;
export const MESSAGE_INITIAL_PAGE_COUNT = 2;

export type MessageRoomPageIndex = {
  pageCount: number;
  messageCount: number;
};

export type MessageHistoryInfo = {
  totalCount: number;
  nextOlderPage: number;
};

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

export function getMessageRewriteStart(current: ChatMessage[], previousStart: number): number {
  return current.length === 0 ? 0 : previousStart;
}

export function prependMessagePage(current: ChatMessage[], olderPage: ChatMessage[]): ChatMessage[] {
  const currentIds = new Set(current.map((message) => message.id));
  return [...olderPage.filter((message) => !currentIds.has(message.id)), ...current];
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
