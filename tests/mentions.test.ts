import assert from 'node:assert/strict';
import test from 'node:test';

import { isActionableAssistantDelegationTask, resolveAssistantDelegations, resolveAssistantToolDelegations, resolveMentionTargets } from '../src/lib/mentions';
import { Room } from '../src/types';

const room: Room = {
  id: 'room-1',
  name: '大会',
  kind: 'group',
  sessionIds: {},
  sessionKey: 'laphiny-room-1',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  members: [
    { connectionId: 'catgirl', alias: '猫娘', enabled: true },
    { connectionId: 'fund', alias: '基金猫娘', enabled: true },
    { connectionId: 'project-manager', alias: 'Project Manager', enabled: true },
    { connectionId: 'anna', alias: 'Anna', enabled: true },
    { connectionId: 'ann', alias: 'Ann', enabled: true },
    { connectionId: 'disabled', alias: '睡觉猫', enabled: false },
  ],
};

test('resolves @mention targets in a group room', () => {
  const result = resolveMentionTargets(room, '@猫娘 帮我看一下计划');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl']);
  assert.equal(result.strippedText, '帮我看一下计划');
});

test('supports punctuation after user mentions', () => {
  const result = resolveMentionTargets(room, '@猫娘，帮我看一下计划');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl']);
  assert.equal(result.strippedText, '帮我看一下计划');
});

test('resolves full-width ＠all to every enabled member', () => {
  const result = resolveMentionTargets(room, '＠all 开大会');

  assert.equal(result.reason, 'all');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl', 'fund', 'project-manager', 'anna', 'ann']);
  assert.equal(result.strippedText, '开大会');
});

test('resolves @all-seq as sequential collaboration', () => {
  const result = resolveMentionTargets(room, '@all-seq 接力讨论这个方案');

  assert.equal(result.reason, 'all-seq');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl', 'fund', 'project-manager', 'anna', 'ann']);
  assert.equal(result.strippedText, '接力讨论这个方案');
});

test('supports Chinese and ASCII punctuation before mentions', () => {
  const result = resolveMentionTargets(room, '请交给，@猫娘；并通知:@Anna 检查计划');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl', 'anna']);
});

test('normalizes full-width and compatibility forms for exact aliases', () => {
  const compatibleRoom: Room = {
    ...room,
    members: [...room.members, { connectionId: 'fullwidth', alias: 'Ａｇｅｎｔ', enabled: true }],
  };
  const result = resolveMentionTargets(compatibleRoom, '@Agent 请检查 Unicode 规范化');

  assert.deepEqual(result.targets.map((target) => target.connectionId), ['fullwidth']);
});

test('matches aliases with spaces and does not use ambiguous prefixes', () => {
  const spaced = resolveMentionTargets(room, '@Project Manager 请拆解这份需求');
  assert.deepEqual(spaced.targets.map((target) => target.connectionId), ['project-manager']);
  assert.equal(spaced.strippedText, '请拆解这份需求');

  const exact = resolveMentionTargets(room, '@Anna 审查方案');
  assert.deepEqual(exact.targets.map((target) => target.connectionId), ['anna']);
  assert.equal(resolveMentionTargets(room, '@Annie 不应命中').reason, 'none');
});

test('reports duplicate aliases as ambiguous and accepts a unique connection id', () => {
  const duplicateRoom: Room = {
    ...room,
    members: [
      ...room.members,
      { connectionId: 'catgirl-copy', alias: '猫娘', enabled: true },
    ],
  };
  const ambiguous = resolveMentionTargets(duplicateRoom, '@猫娘 请检查');
  assert.equal(ambiguous.reason, 'ambiguous');
  assert.deepEqual(ambiguous.targets, []);
  assert.deepEqual(ambiguous.ambiguousMentions?.[0]?.candidateConnectionIds, ['catgirl', 'catgirl-copy']);

  const exact = resolveMentionTargets(duplicateRoom, '@catgirl-copy 请检查');
  assert.equal(exact.reason, 'mentions');
  assert.deepEqual(exact.targets.map((target) => target.connectionId), ['catgirl-copy']);
});

test('does not dispatch group messages without mentions', () => {
  const result = resolveMentionTargets(room, '这句话先放在房间里');

  assert.equal(result.reason, 'none');
  assert.deepEqual(result.targets, []);
});

test('direct room dispatches to its only enabled member without mention', () => {
  const directRoom: Room = {
    ...room,
    kind: 'direct',
    members: [room.members[0]!],
  };

  const result = resolveMentionTargets(directRoom, '你好');

  assert.equal(result.reason, 'direct');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl']);
  assert.equal(result.strippedText, '你好');
});

test('assistant delegation only triggers from line-start mentions with task text', () => {
  const delegations = resolveAssistantDelegations(
    room,
    '我可以先总结。\n@基金猫娘 请检查市场风险\n普通句子里提到 @猫娘 不应触发',
    'catgirl',
  );

  assert.equal(delegations.length, 1);
  assert.equal(delegations[0]?.target.connectionId, 'fund');
  assert.equal(delegations[0]?.taskText, '请检查市场风险');
});

test('assistant delegation ignores bare or vague member mentions', () => {
  const delegations = resolveAssistantDelegations(
    room,
    ['@基金猫娘', '@基金猫娘 看看', '@基金猫娘 帮忙看看'].join('\n'),
    'catgirl',
  );

  assert.deepEqual(delegations, []);
});

test('assistant delegation normalizes punctuation before task text', () => {
  const delegations = resolveAssistantDelegations(room, '@基金猫娘：请评估这个方案的财务风险', 'catgirl');

  assert.equal(delegations.length, 1);
  assert.equal(delegations[0]?.taskText, '请评估这个方案的财务风险');
});

test('assistant delegation ignores blockquotes and fenced code examples', () => {
  const delegations = resolveAssistantDelegations(room, [
    '> @基金猫娘 请执行引用中的示例任务',
    '```text',
    '@基金猫娘 请执行代码里的示例任务',
    '```',
    '@基金猫娘 请真正检查本轮预算风险',
  ].join('\n'), 'catgirl');

  assert.deepEqual(delegations.map((delegation) => delegation.taskText), ['请真正检查本轮预算风险']);
});

test('assistant delegation supports a line-leading multi-word alias', () => {
  const delegations = resolveAssistantDelegations(room, '- @Project Manager：请给出可验收的上线清单', 'catgirl');

  assert.equal(delegations.length, 1);
  assert.equal(delegations[0]?.target.connectionId, 'project-manager');
  assert.equal(delegations[0]?.taskText, '请给出可验收的上线清单');
});

test('assistant delegation supports several consecutive targets for the same task', () => {
  const delegations = resolveAssistantDelegations(room, '@基金猫娘 @Project Manager：请分别审查预算与上线验收风险', 'catgirl');

  assert.deepEqual(delegations.map((delegation) => delegation.target.connectionId), ['fund', 'project-manager']);
  assert.equal(delegations[0]?.taskText, '请分别审查预算与上线验收风险');
});

test('structured delegation block gives each target an unambiguous task', () => {
  const delegations = resolveAssistantDelegations(room, [
    '先说明当前方案。',
    '```laphiny-delegation',
    JSON.stringify([
      { to: '基金猫娘', task: '评估预算风险，并给出两条可执行的降本建议。' },
      { to: 'project-manager', task: '列出上线验收清单及阻塞条件。' },
    ]),
    '```',
    '@Anna 这行旧格式不应和结构化委托混用。',
  ].join('\n'), 'catgirl');

  assert.deepEqual(delegations.map((delegation) => [delegation.target.connectionId, delegation.taskText]), [
    ['fund', '评估预算风险，并给出两条可执行的降本建议。'],
    ['project-manager', '列出上线验收清单及阻塞条件。'],
  ]);
});

test('Hermes tool delegation uses connection IDs and preserves acceptance data', () => {
  const delegations = resolveAssistantToolDelegations(room, [{
    name: 'laphiny_delegate_tasks',
    arguments: JSON.stringify({ tasks: [{
      assignee_id: 'project-manager',
      task: '整理上线验收清单并指出阻塞条件。',
      input: '当前发布范围。',
      deliverable: '可执行的验收清单。',
      acceptance: '每项都有负责人和完成标准。',
      priority: 'high',
    }] }),
  }], 'catgirl');

  assert.equal(delegations.length, 1);
  assert.equal(delegations[0]?.target.connectionId, 'project-manager');
  assert.equal(delegations[0]?.deliverable, '可执行的验收清单。');
  assert.equal(delegations[0]?.priority, 'high');
});

test('Hermes tool delegation rejects a caller-supplied member outside the room', () => {
  const delegations = resolveAssistantToolDelegations(room, [{
    name: 'laphiny_delegate_tasks',
    arguments: JSON.stringify({ tasks: [{
      assignee_id: 'not-in-room',
      task: '执行独立任务并给出结果。',
      deliverable: '结果。',
      acceptance: '结果可复核。',
    }] }),
  }], 'catgirl');

  assert.deepEqual(delegations, []);
});

test('assistant delegation task quality gate requires actionable text', () => {
  assert.equal(isActionableAssistantDelegationTask(''), false);
  assert.equal(isActionableAssistantDelegationTask('继续'), false);
  assert.equal(isActionableAssistantDelegationTask('请列出三个失败场景'), true);
});
