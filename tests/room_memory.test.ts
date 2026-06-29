import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyMemoryCapsuleToRoomGrowth, formatRoomGrowthForPrompt, summarizeRoomGrowth } from '../src/lib/room_growth';
import { formatRoomMemoryForPrompt, parseRoomMemoryResponse, summarizeRoomMemory } from '../src/lib/room_memory';
import type { Room, RoomMemoryCapsule } from '../src/types';

describe('room memory capsule', () => {
  it('parses json response', () => {
    const capsule = parseRoomMemoryResponse(JSON.stringify({
      goal: '长期迭代 Laphiny',
      decisions: ['主打 Soul-native 协作'],
      todos: ['实现议会模式'],
      preferences: ['中文输出'],
      openQuestions: ['如何部署'],
      handoffNotes: '先看阶段四文档',
    }), 'room-1', 'Flor');
    assert.equal(capsule.goal, '长期迭代 Laphiny');
    assert.equal(capsule.decisions.length, 1);
    assert.match(summarizeRoomMemory(capsule), /目标/);
    assert.match(formatRoomMemoryForPrompt(capsule), /Soul-native/);
  });
});

describe('room growth layer', () => {
  it('derives knowledge, decisions, and blackboard items from confirmed memory', () => {
    const now = '2026-06-29T00:00:00.000Z';
    const room: Room = {
      id: 'room_1',
      name: '产品工作室',
      kind: 'group',
      members: [],
      sessionIds: {},
      sessionKey: 'session',
      createdAt: now,
      updatedAt: now,
    };
    const capsule: RoomMemoryCapsule = {
      id: 'memory_1',
      roomId: room.id,
      goal: '长期打磨 Soul-native 协作',
      decisions: ['用户是召集人与最终决策者'],
      todos: ['补充协作黑板入口'],
      preferences: ['保留 Agent 自己的表达风格'],
      openQuestions: ['如何展示成长阶段'],
      handoffNotes: '先看决策记录再继续。',
      source: 'agent-generated',
      authorName: 'Laper',
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    const growth = applyMemoryCapsuleToRoomGrowth(room, capsule, now, (prefix) => `${prefix}_1`);
    const nextRoom = { ...room, ...growth, memoryCapsule: capsule };

    assert.equal(growth.knowledgeBase?.length, 3);
    assert.equal(growth.decisionRecords?.length, 1);
    assert.equal(growth.blackboardItems?.length, 2);
    assert.match(formatRoomGrowthForPrompt(nextRoom), /Soul-native/);
    assert.equal(summarizeRoomGrowth(nextRoom).level, 'settled');
  });
});
