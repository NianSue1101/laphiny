import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  beginDelegationAttempt,
  canRetryDelegationTask,
  mergeDelegationTaskRecords,
  normalizeDelegationTasksAfterHydration,
  transitionDelegationAttempt,
} from '../src/lib/delegation_tasks';
import type { DelegationTask } from '../src/types';

const now = '2026-07-16T00:00:00.000Z';
const base = {
  id: 'task_1', roomId: 'room_1', roomName: 'Room',
  fromConnectionId: 'lead', fromAlias: 'Lead', toConnectionId: 'worker', toAlias: 'Worker',
  taskText: 'Do work', status: 'pending', depth: 1, attempts: 0,
  createdAt: now, updatedAt: now,
} as DelegationTask;

function beginInitial() {
  return beginDelegationAttempt(base, {
    operationId: 'initial:task_1', kind: 'initial', toConnectionId: 'worker', toAlias: 'Worker',
    now, attemptId: 'attempt_1',
  }).task;
}

test('delegation attempts are idempotent by operation id', () => {
  const task = beginInitial();
  const replay = beginDelegationAttempt(task, {
    operationId: 'initial:task_1', kind: 'initial', toConnectionId: 'worker', toAlias: 'Worker',
    now, attemptId: 'different',
  });
  assert.equal(replay.created, false);
  assert.equal(replay.attempt.id, 'attempt_1');
  assert.equal(replay.task.attemptHistory?.length, 1);
});

test('retry preserves the logical task and appends a clean attempt', () => {
  let task = beginInitial();
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'running', now });
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'error', error: 'boom', resultMessageId: 'msg_1', now });
  assert.equal(canRetryDelegationTask(task), true);
  const retry = beginDelegationAttempt(task, {
    operationId: 'retry-click-1', kind: 'retry', toConnectionId: 'worker', toAlias: 'Worker',
    now: '2026-07-16T00:01:00.000Z', attemptId: 'attempt_2',
  }).task;
  assert.equal(retry.id, task.id);
  assert.equal(retry.attempts, 2);
  assert.equal(retry.error, undefined);
  assert.equal(retry.completedAt, undefined);
  assert.equal(retry.currentAttemptId, 'attempt_2');
});

test('late completion from an old attempt cannot overwrite a reassign', () => {
  let task = beginInitial();
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'running', now });
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'error', error: 'failed', now });
  task = beginDelegationAttempt(task, {
    operationId: 'reassign-1', kind: 'reassign', toConnectionId: 'worker_2', toAlias: 'Worker 2',
    now: '2026-07-16T00:01:00.000Z', attemptId: 'attempt_2',
  }).task;
  assert.throws(() => transitionDelegationAttempt(task, 'attempt_1', { status: 'done', now: '2026-07-16T00:02:00.000Z' }));
  assert.equal(task.currentAttemptId, 'attempt_2');
  assert.equal(task.toConnectionId, 'worker_2');
});

test('permission wait blocks retry and reassign', () => {
  let task = beginInitial();
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'running', now });
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'waiting_permission', now });
  assert.equal(canRetryDelegationTask(task), false);
  assert.throws(() => beginDelegationAttempt(task, {
    operationId: 'retry', kind: 'retry', toConnectionId: 'worker', toAlias: 'Worker', now, attemptId: 'attempt_2',
  }));
});

test('hydration marks active attempts interrupted and merge rejects stale revisions', () => {
  let task = beginInitial();
  task = transitionDelegationAttempt(task, 'attempt_1', { status: 'running', now });
  const interrupted = normalizeDelegationTasksAfterHydration([task], '2026-07-16T01:00:00.000Z')[0]!;
  assert.equal(interrupted.status, 'error');
  assert.equal(interrupted.attemptHistory?.[0]?.status, 'interrupted');
  const stale = { ...task, revision: 0, status: 'pending' as const, updatedAt: '2026-07-15T00:00:00.000Z' };
  const merged = mergeDelegationTaskRecords([interrupted, stale]);
  assert.equal(merged[0]?.revision, interrupted.revision);
  assert.equal(merged[0]?.status, 'error');
});
