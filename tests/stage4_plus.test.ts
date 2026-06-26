import assert from 'node:assert/strict';
import { buildTaskBoard, buildSoulRelations, getRoomModeDefinition, makeDefaultRoleplayArchive, parseRoleplayArchiveResponse } from '../src/lib/stage4_plus';
import { DelegationTask, Room } from '../src/types';

const review = getRoomModeDefinition('review');
assert.equal(review.defaultCollaborationMode, 'sequential');
assert.equal(review.autoDelegationEnabled, true);
assert.equal(getRoomModeDefinition('tabletop').roleplayEnabled, true);

const fallback = makeDefaultRoleplayArchive('雨夜桌游店', { enabled: true, playerName: '调查员', genre: '都市怪谈', tone: '悬疑', premise: '旧书店', currentScene: '柜台前', includeAllAgents: true, updatedAt: 'now' });
const parsed = parseRoleplayArchiveResponse(JSON.stringify({ title: '旧书店之夜', chapter: 2, world: '只有雨夜出现的书店', currentQuest: '找到无名账本', playerCharacter: '调查员', npcs: ['店主：沉默'], locations: ['旧书店'], items: ['账本'], clues: ['绿色台灯'], mysteries: ['店为什么只在雨夜出现'], playerChoices: ['进入书店'], gmNotes: '店主知道真相' }), fallback);
assert.equal(parsed.title, '旧书店之夜');
assert.equal(parsed.chapter, 2);
assert.equal(parsed.version, fallback.version + 1);
assert.deepEqual(parsed.clues, ['绿色台灯']);

const tasks: DelegationTask[] = [
  makeTask('a', 'pending'),
  makeTask('b', 'running'),
  makeTask('c', 'done'),
  makeTask('d', 'error'),
];
const board = buildTaskBoard(tasks);
assert.equal(board.find((column) => column.id === 'todo')?.tasks.length, 1);
assert.equal(board.find((column) => column.id === 'running')?.tasks.length, 1);
assert.equal(board.find((column) => column.id === 'done')?.tasks.length, 1);
assert.equal(board.find((column) => column.id === 'blocked')?.tasks.length, 1);

const room: Room = {
  id: 'room_1',
  name: '测试房间',
  kind: 'group',
  members: [
    { connectionId: 'a', alias: 'Flor', enabled: true },
    { connectionId: 'b', alias: 'Laper', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'session',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const relations = buildSoulRelations({
  rooms: [room],
  connections: [
    { id: 'a', name: 'Flor', baseUrl: '', apiKey: '', model: '', enabled: true, createdAt: '', updatedAt: '' },
    { id: 'b', name: 'Laper', baseUrl: '', apiKey: '', model: '', enabled: true, createdAt: '', updatedAt: '' },
  ],
  collaborationEvents: [],
  delegationTasks: [makeTask('rel', 'done')],
  messagesByRoom: {},
});
assert.equal(relations[0].fromName, 'Flor');
assert.equal(relations[0].toName, 'Laper');
assert.equal(relations[0].completions, 1);

console.log('stage4 plus tests passed');

function makeTask(id: string, status: DelegationTask['status']): DelegationTask {
  return {
    id,
    roomId: 'room_1',
    roomName: '测试房间',
    fromConnectionId: 'a',
    fromAlias: 'Flor',
    toConnectionId: 'b',
    toAlias: 'Laper',
    taskText: '处理任务',
    status,
    depth: 1,
    createdAt: `2026-01-01T00:00:0${id.length}.000Z`,
    updatedAt: `2026-01-01T00:00:0${id.length}.000Z`,
  };
}
