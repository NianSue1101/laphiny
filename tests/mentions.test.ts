import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMentionTargets } from '../src/lib/mentions';
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
    { connectionId: 'disabled', alias: '睡觉猫', enabled: false },
  ],
};

test('resolves @mention targets in a group room', () => {
  const result = resolveMentionTargets(room, '@猫娘 帮我看一下计划');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl']);
  assert.equal(result.strippedText, '帮我看一下计划');
});

test('resolves full-width ＠all to every enabled member', () => {
  const result = resolveMentionTargets(room, '＠all 开大会');

  assert.equal(result.reason, 'all');
  assert.deepEqual(result.targets.map((target) => target.connectionId), ['catgirl', 'fund']);
  assert.equal(result.strippedText, '开大会');
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
