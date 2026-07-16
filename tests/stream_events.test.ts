import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAgentStreamEvent,
  makeInitialAgentStreamState,
  normalizeInterruptedChatMessages,
  reduceAgentStreamEvent,
  shouldDisplayServiceReasoning,
  summarizeActiveAgentStreams,
  summarizeGlobalAgentStreams,
} from '../src/lib/stream_events';

function initial(messageId = 'message-1', roomId = 'room-1', connectionId = 'agent-1') {
  return makeInitialAgentStreamState({ messageId, roomId, connectionId, now: '2026-07-15T00:00:00.000Z' });
}

test('keeps reasoning separate from visible content through ordered stream events', () => {
  let state = initial();
  state = reduceAgentStreamEvent(state, createAgentStreamEvent(state, {
    messageId: state.messageId,
    roomId: state.roomId,
    connectionId: state.connectionId,
    phase: 'connecting',
    kind: 'status',
  }));
  state = reduceAgentStreamEvent(state, createAgentStreamEvent(state, {
    messageId: state.messageId,
    roomId: state.roomId,
    connectionId: state.connectionId,
    phase: 'thinking',
    kind: 'reasoning',
    reasoning: '服务端返回的摘要',
  }));
  state = reduceAgentStreamEvent(state, createAgentStreamEvent(state, {
    messageId: state.messageId,
    roomId: state.roomId,
    connectionId: state.connectionId,
    phase: 'responding',
    kind: 'content',
    content: '给用户的正文',
  }));

  assert.equal(state.reasoning, '服务端返回的摘要');
  assert.equal(state.content, '给用户的正文');
  assert.equal(state.phase, 'responding');
});

test('rejects invalid transitions and ignores stale events', () => {
  const state = initial();
  const connectingEvent = createAgentStreamEvent(state, {
    messageId: state.messageId,
    roomId: state.roomId,
    connectionId: state.connectionId,
    phase: 'connecting',
    kind: 'status',
  });
  const connecting = reduceAgentStreamEvent(state, connectingEvent);
  const terminal = createAgentStreamEvent(connecting, {
    messageId: state.messageId,
    roomId: state.roomId,
    connectionId: state.connectionId,
    phase: 'completed',
    kind: 'terminal',
  });
  const completed = reduceAgentStreamEvent(connecting, terminal);
  const stale = { ...terminal, sequence: 0, phase: 'responding' as const };
  assert.equal(reduceAgentStreamEvent(completed, stale), completed);
  assert.throws(() => reduceAgentStreamEvent(completed, { ...terminal, sequence: 3, phase: 'responding' }), /非法流状态转换/);
});

test('summarizes active streams independently by room', () => {
  const one = { ...initial('m1', 'room-a', 'agent-1'), phase: 'thinking' as const };
  const two = { ...initial('m2', 'room-b', 'agent-1'), phase: 'responding' as const };
  const done = { ...initial('m3', 'room-a', 'agent-2'), phase: 'completed' as const };
  const summaries = summarizeActiveAgentStreams({ m1: one, m2: two, m3: done });

  assert.equal(summaries['room-a']?.label, '思考中');
  assert.equal(summaries['room-b']?.label, '回复中');
  assert.equal(summaries['room-a']?.activeCount, 1);
  const global = summarizeGlobalAgentStreams({ m1: one, m2: two, m3: done });
  assert.equal(global.activeRooms, 2);
  assert.equal(global.activeAgents, 1);
  assert.equal(global.byPhase.responding, 1);
});

test('only exposes service reasoning when the user enables it', () => {
  assert.equal(shouldDisplayServiceReasoning(false, '服务端 reasoning'), false);
  assert.equal(shouldDisplayServiceReasoning(true, '  '), false);
  assert.equal(shouldDisplayServiceReasoning(true, '服务端 reasoning'), true);
});

test('records cancellation as a terminal state without marking partial content complete', () => {
  let state = initial();
  for (const phase of ['connecting', 'responding', 'cancelled'] as const) {
    const event = createAgentStreamEvent(state, {
      messageId: state.messageId,
      roomId: state.roomId,
      connectionId: state.connectionId,
      phase,
      kind: phase === 'cancelled' ? 'terminal' : phase === 'responding' ? 'content' : 'status',
      content: phase === 'responding' ? '尚未完成的正文' : undefined,
    });
    state = reduceAgentStreamEvent(state, event);
  }

  assert.equal(state.phase, 'cancelled');
  assert.equal(state.content, '尚未完成的正文');
  assert.ok(state.completedAt);
});

test('marks an unfinished hydrated agent reply as interrupted and retryable', () => {
  const [message] = normalizeInterruptedChatMessages([{
    id: 'm1',
    roomId: 'room-1',
    role: 'assistant',
    authorId: 'agent-1',
    authorName: 'Agent One',
    content: '已经收到一部分',
    status: 'running',
    streamPhase: 'responding',
    createdAt: '2026-07-15T00:00:00.000Z',
  }], '2026-07-15T00:01:00.000Z');

  assert.equal(message?.content, '已经收到一部分');
  assert.equal(message?.status, 'stopped');
  assert.equal(message?.streamPhase, 'cancelled');
  assert.match(message?.error ?? '', /可以安全重试/);
});

test('does not reinterpret queued user messages as interrupted agent work', () => {
  const message = {
    id: 'm-user',
    roomId: 'room-1',
    role: 'user' as const,
    authorId: 'user' as const,
    authorName: 'You',
    content: 'hello',
    status: 'queued' as const,
    createdAt: '2026-07-15T00:00:00.000Z',
  };

  assert.equal(normalizeInterruptedChatMessages([message], '2026-07-15T00:01:00.000Z')[0], message);
});
