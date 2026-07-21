import assert from 'node:assert/strict';
import test from 'node:test';

import { decideMessageIndexRecovery, getChangedMessageTail, getInitialPageStart, getMessageRewriteStart, isMessagePagesIndex, MESSAGE_PAGE_SIZE, needsMessagePageRepack, prependMessagePage, reconcileWindowedMessagesByRoom, splitMessagePages } from '../src/storage/message_pages';
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

test('splits long history and selects only the newest initial page', () => {
  const pages = splitMessagePages(Array.from({ length: 205 }, (_, index) => message(String(index))), 100);

  assert.deepEqual(pages.map((page) => page.length), [100, 100, 5]);
  assert.equal(getInitialPageStart(pages.length), 2);
});

test('indexes written with a different page size are flagged for repack', () => {
  assert.equal(needsMessagePageRepack({ version: 2, rooms: {} }), true);
  assert.equal(needsMessagePageRepack({ version: 2, pageSize: 100, rooms: {} }), true);
  assert.equal(needsMessagePageRepack({ version: 2, pageSize: MESSAGE_PAGE_SIZE, rooms: {} }), false);
});

test('legacy pages re-split with the current page size keep every message', () => {
  const legacyPages = splitMessagePages(Array.from({ length: 500 }, (_, index) => message(String(index))), 100);
  const repacked = splitMessagePages(legacyPages.flat());

  assert.equal(legacyPages.length, 5);
  assert.equal(repacked.length, 25);
  assert.equal(repacked.flat().length, 500);
  assert.equal(repacked.at(-1)!.length, MESSAGE_PAGE_SIZE);
  assert.equal(getInitialPageStart(repacked.length), 24);
});

test('initial window loads only the newest page even when it is short', () => {
  // 179 messages = 8 full pages of 20 plus a 19-message tail page (page index 8).
  assert.equal(getInitialPageStart(9), 8);
  // 502 messages = 25 full pages of 20 plus a 2-message tail page.
  assert.equal(getInitialPageStart(26), 25);
  // A full last page maps to the last page.
  assert.equal(getInitialPageStart(25), 24);
  // Small histories start at zero; empty rooms stay at zero.
  assert.equal(getInitialPageStart(1), 0);
  assert.equal(getInitialPageStart(0), 0);
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

test('rejects corrupt page indexes before they can hide history', () => {
  assert.equal(isMessagePagesIndex({ version: 2, rooms: { room: { pageCount: 2, messageCount: 101 } } }), true);
  assert.equal(isMessagePagesIndex({ version: 2, rooms: { room: { pageCount: -1, messageCount: 101 } } }), false);
  assert.equal(isMessagePagesIndex({ version: 2, rooms: { room: { pageCount: 0, messageCount: 101 } } }), false);
  assert.equal(isMessagePagesIndex({ version: 1, rooms: {} }), false);
});

test('repairs a corrupt primary index from backup instead of returning empty history', () => {
  const backup = { version: 2 as const, rooms: { room: { pageCount: 3, messageCount: 205 } } };
  const decision = decideMessageIndexRecovery({
    primary: { broken: true },
    backup,
    legacy: null,
    primaryExists: true,
    legacyExists: false,
  });

  assert.equal(decision.source, 'backup');
  if (decision.source === 'backup') assert.deepEqual(decision.index, backup);
});

test('surfaces unrecoverable corruption instead of silently creating an empty index', () => {
  const decision = decideMessageIndexRecovery({
    primary: { broken: true },
    backup: { alsoBroken: true },
    legacy: {},
    primaryExists: true,
    legacyExists: true,
  });

  assert.equal(decision.source, 'error');
});

test('page indexes reject invalid page size stamps', () => {
  assert.equal(isMessagePagesIndex({ version: 2, pageSize: 20, rooms: {} }), true);
  assert.equal(isMessagePagesIndex({ version: 2, pageSize: 0, rooms: {} }), false);
  assert.equal(isMessagePagesIndex({ version: 2, pageSize: '20', rooms: {} }), false);
});

test('reloading a paged window keeps messages sent while reloading', () => {
  const base = { room: [message('1'), message('2'), message('3')] };
  const latest = { room: [...base.room, message('4')] };
  const windowed = { room: [message('2'), message('3')] };

  const reconciled = reconcileWindowedMessagesByRoom({ latest, base, windowed });
  assert.deepEqual(reconciled.room!.map((item) => item.id), ['2', '3', '4']);
});

test('reloading a paged window applies cleanly when nothing changed locally', () => {
  const base = { room: [message('1'), message('2')] };
  const windowed = { room: [message('2')] };

  const reconciled = reconcileWindowedMessagesByRoom({ latest: base, base, windowed });
  assert.deepEqual(reconciled.room!.map((item) => item.id), ['2']);
});

test('reloading a paged window does not resurrect a room cleared while reloading', () => {
  const base = { room: [message('1')], other: [message('9')] };
  const latest = { other: [message('9')] };
  const windowed = { room: [message('1')], other: [message('9')] };

  const reconciled = reconcileWindowedMessagesByRoom({ latest, base, windowed });
  assert.equal('room' in reconciled, false);
  assert.deepEqual(reconciled.other!.map((item) => item.id), ['9']);
});
