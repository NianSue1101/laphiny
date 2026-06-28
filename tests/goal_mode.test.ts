import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGoalModePrompt, buildGoalReviewPrompt, parseGoalCommand, parseGoalPlanItems, parseGoalStatusSignal } from '../src/lib/goal_mode';
import type { HermesConnection, Room } from '../src/types';

const room: Room = {
  id: 'room_goal',
  name: 'Goal Room',
  kind: 'group',
  members: [
    { connectionId: 'lead', alias: 'Lead', enabled: true },
    { connectionId: 'impl', alias: 'Impl', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'session',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const connections: HermesConnection[] = [
  {
    id: 'lead',
    name: 'Lead',
    baseUrl: 'https://example.invalid',
    apiKey: '',
    model: 'model-a',
    enabled: true,
    profile: {
      strengths: ['planning'],
      delegateWhen: ['implementation needed'],
      avoidWhen: [],
      source: 'manual',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'impl',
    name: 'Impl',
    baseUrl: 'https://example.invalid',
    apiKey: '',
    model: 'model-b',
    enabled: true,
    profile: {
      strengths: ['implementation'],
      delegateWhen: ['code changes needed'],
      avoidWhen: [],
      source: 'manual',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

test('parses /goal command text', () => {
  assert.deepEqual(parseGoalCommand('/goal ship the feature'), { id: 'goal', goal: 'ship the feature' });
  assert.deepEqual(parseGoalCommand('/GOAL\nfinish release'), { id: 'goal', goal: 'finish release' });
  assert.deepEqual(parseGoalCommand('/goal @Lead ship it'), { id: 'goal', leadMention: 'Lead', goal: 'ship it' });
  assert.equal(parseGoalCommand('/goals are different'), null);
});

test('builds goal mode prompts with delegation and review protocol', () => {
  const prompt = buildGoalModePrompt({ goal: 'finish goal mode', room, leadMember: room.members[0]!, connections });
  assert.match(prompt, /\/goal 目标模式/);
  assert.match(prompt, /唯一主 AI/);
  assert.match(prompt, /一次发起多条独立委托/);
  assert.match(prompt, /@成员名 任务说明/);
  assert.match(prompt, /Impl/);

  const reviewPrompt = buildGoalReviewPrompt({ goal: 'finish goal mode', room, leadMember: room.members[0]!, connections, round: 1 });
  assert.match(reviewPrompt, /复盘审查/);
  assert.match(reviewPrompt, /如果已达成/);
  assert.match(reviewPrompt, /如果未达成/);
});

test('parses structured goal status and plan blocks', () => {
  const text = [
    'Plan:',
    '```laphiny-goal-plan',
    JSON.stringify([
      {
        title: 'Fix mobile composer',
        owner: 'Impl',
        reason: 'React Native layout task',
        input: 'App.tsx',
        deliverable: 'patch',
        acceptance: 'keyboard no longer covers input',
        status: 'running',
      },
    ]),
    '```',
    'GOAL_STATUS: continue',
  ].join('\n');

  assert.equal(parseGoalStatusSignal(text), 'continue');
  const items = parseGoalPlanItems(text, room, '2026-01-01T00:00:00.000Z');
  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'Fix mobile composer');
  assert.equal(items[0]?.ownerAlias, 'Impl');
  assert.equal(items[0]?.ownerConnectionId, 'impl');
  assert.equal(items[0]?.status, 'running');
});
