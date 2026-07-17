import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildMessageSearchDocuments,
  findMessageSearchDocumentIds,
  shouldAutoLoadOlderMessages,
  shouldShowJumpToLatest,
} from '../src/lib/message_search';
import { getInitialPageStart, splitMessagePages } from '../src/storage/message_pages';
import type { ChatMessage } from '../src/types';

function message(id: string, content = id): ChatMessage {
  return {
    id,
    roomId: 'room',
    role: 'assistant',
    authorId: 'agent',
    authorName: 'Agent',
    content,
    status: 'sent',
    createdAt: `2026-01-01T00:00:${id.padStart(2, '0')}.000Z`,
  };
}

test('builds lightweight searchable documents without retaining message objects', () => {
  const source = message('01', 'Android 分页历史');
  const documents = buildMessageSearchDocuments('room', [source]);

  assert.deepEqual(findMessageSearchDocumentIds(documents, '分页'), ['01']);
  assert.equal('content' in documents[0]!, false);
  assert.equal(documents[0]?.roomId, 'room');
});

test('search results are newest-first and capped', () => {
  const documents = buildMessageSearchDocuments('room', [
    message('01', '目标模式'),
    message('02', '目标模式审查'),
    message('03', '无关'),
  ]);

  assert.deepEqual(findMessageSearchDocumentIds(documents, '目标模式', 1), ['02']);
});

test('auto-load only triggers near the top while idle and outside search', () => {
  assert.equal(shouldAutoLoadOlderMessages({ offsetY: 40, hasOlderMessages: true, loading: false, searching: false }), true);
  assert.equal(shouldAutoLoadOlderMessages({ offsetY: 100, hasOlderMessages: true, loading: false, searching: false }), false);
  assert.equal(shouldAutoLoadOlderMessages({ offsetY: 40, hasOlderMessages: true, loading: true, searching: false }), false);
  assert.equal(shouldAutoLoadOlderMessages({ offsetY: 40, hasOlderMessages: true, loading: false, searching: true }), false);
});

test('jump-to-latest only appears when at least twenty messages are newer', () => {
  assert.equal(shouldShowJumpToLatest({ messageCount: 50, lastVisibleIndex: 29 }), true);
  assert.equal(shouldShowJumpToLatest({ messageCount: 50, lastVisibleIndex: 30 }), false);
  assert.equal(shouldShowJumpToLatest({ messageCount: 0, lastVisibleIndex: -1 }), false);
});

test('large history keeps the initial read window fixed at two pages', () => {
  const pages = splitMessagePages(Array.from({ length: 50_000 }, (_, index) => message(String(index))), 100);

  assert.equal(pages.length, 500);
  assert.equal(pages.length - getInitialPageStart(pages.length), 2);
});
