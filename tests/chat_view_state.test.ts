import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveChatViewState } from '../src/lib/chat_view_state';

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
