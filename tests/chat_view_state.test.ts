import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  advanceChatScrollLifecycle,
  canExecuteChatScroll,
  resolveChatViewState,
  shouldAutoScrollChat,
} from '../src/lib/chat_view_state';

describe('chat view state', () => {
  it('shows a selected room in the wide layout', () => {
    assert.deepEqual(resolveChatViewState({
      tab: 'chat',
      selectedRoomId: 'room-1',
      mobileFocusedRoomId: null,
      width: 1200,
    }), {
      key: 'chat:room-1:wide',
      listVisible: true,
    });
  });

  it('keeps the mobile room picker distinct from a focused chat', () => {
    assert.deepEqual(resolveChatViewState({
      tab: 'chat',
      selectedRoomId: 'room-1',
      mobileFocusedRoomId: null,
      width: 430,
    }), {
      key: 'chat:room-1:picker',
      listVisible: false,
    });

    assert.deepEqual(resolveChatViewState({
      tab: 'chat',
      selectedRoomId: 'room-1',
      mobileFocusedRoomId: 'room-1',
      width: 430,
    }), {
      key: 'chat:room-1:focused',
      listVisible: true,
    });
  });

  it('does not expose a chat list without a room or outside the chat tab', () => {
    assert.equal(resolveChatViewState({
      tab: 'chat',
      selectedRoomId: null,
      mobileFocusedRoomId: null,
      width: 430,
    }).listVisible, false);

    assert.equal(resolveChatViewState({
      tab: 'settings',
      selectedRoomId: 'room-1',
      mobileFocusedRoomId: 'room-1',
      width: 430,
    }).listVisible, false);
  });
});

describe('chat scroll lifecycle', () => {
  it('increments its generation when visibility or the mounted view changes', () => {
    const initial = { generation: 4, viewKey: 'chat:room-1:focused', visible: true };
    assert.equal(advanceChatScrollLifecycle(initial, {
      viewKey: initial.viewKey,
      visible: true,
    }), initial);

    const hidden = advanceChatScrollLifecycle(initial, {
      viewKey: initial.viewKey,
      visible: false,
    });
    assert.deepEqual(hidden, {
      generation: 5,
      viewKey: initial.viewKey,
      visible: false,
    });

    assert.deepEqual(advanceChatScrollLifecycle(hidden, {
      viewKey: 'chat:room-2:focused',
      visible: true,
    }), {
      generation: 6,
      viewKey: 'chat:room-2:focused',
      visible: true,
    });
  });

  it('rejects stale animation-frame work and every hidden-list scroll', () => {
    const current = { generation: 8, viewKey: 'chat:room-1:focused', visible: true };
    assert.equal(canExecuteChatScroll(8, current), true);
    assert.equal(canExecuteChatScroll(7, current), false);
    assert.equal(canExecuteChatScroll(8, { ...current, visible: false }), false);
  });

  it('only auto-scrolls a visible list that is pending or already at the bottom', () => {
    assert.equal(shouldAutoScrollChat({
      listVisible: false,
      pendingScrollToEnd: true,
      listAtBottom: true,
    }), false);
    assert.equal(shouldAutoScrollChat({
      listVisible: true,
      pendingScrollToEnd: false,
      listAtBottom: false,
    }), false);
    assert.equal(shouldAutoScrollChat({
      listVisible: true,
      pendingScrollToEnd: true,
      listAtBottom: false,
    }), true);
    assert.equal(shouldAutoScrollChat({
      listVisible: true,
      pendingScrollToEnd: false,
      listAtBottom: true,
    }), true);
  });
});
