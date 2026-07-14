import assert from 'node:assert/strict';
import test from 'node:test';

import { applyGoalAssistantReview, canTransitionGoalSession, collectGoalDelegationEvidence, transitionGoalSession } from '../src/lib/goal_state_machine';
import { makeGoalSession } from '../src/lib/goal_session';
import type { GoalPlanItem, RoomMember } from '../src/types';

const lead: RoomMember = { connectionId: 'lead', alias: 'Lead', enabled: true };
const now = '2026-07-15T00:00:00.000Z';

function plan(status: GoalPlanItem['status'], acceptance = '测试通过'): GoalPlanItem {
  return {
    id: 'implementation',
    title: '实现功能',
    ownerAlias: 'Lead',
    ownerConnectionId: 'lead',
    deliverable: '代码和测试',
    acceptance,
    status,
    updatedAt: now,
  };
}

test('enforces legal goal state transitions', () => {
  assert.equal(canTransitionGoalSession('planning', 'running'), true);
  assert.equal(canTransitionGoalSession('done', 'running'), false);
  const goal = makeGoalSession('room', '完成迭代', lead, now);
  assert.throws(() => transitionGoalSession({ ...goal, status: 'done' }, 'running', now), /非法目标状态转换/);
});

test('does not accept a self-reported done without verifiable acceptance', () => {
  const goal = makeGoalSession('room', '完成迭代', lead, now);
  const reviewed = applyGoalAssistantReview(goal, {
    signal: 'done',
    planItems: [plan('done', '')],
    messageId: 'message-1',
    conclusion: '已经完成。',
    round: 1,
    now,
  });

  assert.equal(reviewed.status, 'adjusting');
  assert.match(reviewed.nextAction ?? '', /未通过的验收条件/);
});

test('does not treat a lead review as acceptance evidence', () => {
  const goal = makeGoalSession('room', '完成迭代', lead, now);
  const reviewed = applyGoalAssistantReview(goal, {
    signal: 'done',
    planItems: [plan('done')],
    messageId: 'message-2',
    conclusion: '测试通过并完成交付。',
    round: 1,
    now,
  });

  assert.equal(reviewed.status, 'adjusting');
  assert.equal(reviewed.acceptanceCriteria[0]?.status, 'pending');
  assert.deepEqual(reviewed.acceptanceCriteria[0]?.evidenceIds, []);
  assert.equal(reviewed.reviewHistory.length, 1);
});

test('completes when a finished delegation supplies evidence for the plan item', () => {
  const goal = makeGoalSession('room', '完成迭代', lead, now);
  const evidence = collectGoalDelegationEvidence(goal.id, [{
    id: 'task-1',
    roomId: 'room',
    roomName: 'Room',
    fromConnectionId: 'lead',
    fromAlias: 'Lead',
    toConnectionId: 'implementer',
    toAlias: 'Implementer',
    taskText: '实现功能并提供测试结果',
    status: 'done',
    depth: 1,
    category: 'delegation',
    goalId: goal.id,
    planItemId: 'implementation',
    evidence: ['测试通过'],
    resultMessageId: 'message-delegation',
    createdAt: now,
    updatedAt: now,
    completedAt: now,
  }]);
  const reviewed = applyGoalAssistantReview(goal, {
    signal: 'done',
    planItems: [plan('done')],
    evidence,
    messageId: 'message-2',
    conclusion: '已核对委托结果。',
    round: 1,
    now,
  });

  assert.equal(reviewed.status, 'done');
  assert.equal(reviewed.acceptanceCriteria[0]?.status, 'passed');
  assert.deepEqual(reviewed.acceptanceCriteria[0]?.evidenceIds, ['delegation:task-1']);
});

test('pauses after the configured safety round limit', () => {
  const goal = { ...makeGoalSession('room', '持续迭代', lead, now), maxRounds: 2 };
  const reviewed = applyGoalAssistantReview(goal, {
    signal: 'continue',
    planItems: [plan('running')],
    messageId: 'message-3',
    conclusion: '继续处理。',
    round: 2,
    now,
  });

  assert.equal(reviewed.status, 'awaiting_user');
  assert.match(reviewed.blockedReason ?? '', /安全上限/);
});
