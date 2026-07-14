import assert from 'node:assert/strict';
import test from 'node:test';

import { getChangedMessageTail, getInitialPageStart, getMessageRewriteStart, prependMessagePage, splitMessagePages } from '../src/storage/message_pages';
import type { ChatMessage } from '../src/types';

function message(id: string): ChatMessage {
  return {
    id,
    roomId: 'room',
    role: 'user',
    authorId: 'user',
    authorName: '你',
    content: id,
    status: 'sent',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

test('splits long history and selects only the newest initial pages', () => {
  const pages = splitMessagePages(Array.from({ length: 205 }, (_, index) => message(String(index))), 100);

  assert.deepEqual(pages.map((page) => page.length), [100, 100, 5]);
  assert.equal(getInitialPageStart(pages.length), 1);
});

test('does not rewrite history when the UI only prepends an older page', () => {
  const old = [message('1'), message('2')];
  const storedTail = [message('3'), message('4')];

  assert.equal(getChangedMessageTail([...old, ...storedTail], storedTail), null);
});

test('returns the changed suffix when a new turn is appended', () => {
  const storedTail = [message('3'), message('4')];
  const changed = getChangedMessageTail([...storedTail, message('5')], storedTail);

  assert.deepEqual(changed?.map((item) => item.id), ['3', '4', '5']);
});

test('prepends an older page without duplicating messages already loaded', () => {
  const current = [message('3'), message('4')];
  const older = [message('1'), message('2'), message('3')];

  assert.deepEqual(prependMessagePage(current, older).map((item) => item.id), ['1', '2', '3', '4']);
});

test('clearing a room rewrites from page zero so no old page stays referenced', () => {
  assert.equal(getMessageRewriteStart([], 7), 0);
  assert.equal(getMessageRewriteStart([message('8')], 7), 7);
});
