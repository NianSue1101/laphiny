import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRoleplaySystemAppendix, buildRoleplayTurnPrompt, getRoleplayTargets, isRoleplayUserTurn, makeDefaultRoleplayConfig, parseRoleplayCommand } from '../src/lib/roleplay';
import { Room } from '../src/types';

const room: Room = {
  id: 'room_1',
  name: '雨夜桌游店',
  kind: 'group',
  members: [
    { connectionId: 'gm', alias: 'Flor', enabled: true },
    { connectionId: 'actor', alias: 'Laper', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'session',
  contextLimit: 20,
  roleplay: {
    ...makeDefaultRoleplayConfig('gm'),
    enabled: true,
    playerName: '调查员',
    genre: '都市怪谈',
    tone: '悬疑、温柔',
    premise: '旧书店在雨夜开门。',
    currentScene: '调查员站在门口。',
  },
  createdAt: '2026-06-27T00:00:00.000Z',
  updatedAt: '2026-06-27T00:00:00.000Z',
};

test('roleplay commands are parsed', () => {
  assert.equal(parseRoleplayCommand('/rp 开始冒险')?.id, 'rp');
  assert.equal(parseRoleplayCommand('/scene 门后传来铃声')?.id, 'scene');
  assert.equal(parseRoleplayCommand('/ooc 节奏慢一点')?.id, 'ooc');
  assert.equal(parseRoleplayCommand('/rp-stop')?.kind, 'stop');
});

test('roleplay routes ordinary group turns to gm first', () => {
  assert.equal(isRoleplayUserTurn(room, '我推开门'), true);
  assert.equal(isRoleplayUserTurn(room, '@Flor 我推开门'), false);
  const targets = getRoleplayTargets(room);
  assert.deepEqual(targets.map((member) => member.alias), ['Flor', 'Laper']);
});

test('roleplay prompt and system appendix distinguish gm from actor', () => {
  assert.match(buildRoleplayTurnPrompt(room, '/scene 雨声变大'), /场景设定更新/);
  assert.match(buildRoleplaySystemAppendix(room, room.members[0]!), /主叙事 \/ GM/);
  assert.match(buildRoleplaySystemAppendix(room, room.members[1]!), /不要抢夺主叙事权/);
});
