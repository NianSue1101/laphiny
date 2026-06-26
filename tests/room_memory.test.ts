import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatRoomMemoryForPrompt, parseRoomMemoryResponse, summarizeRoomMemory } from '../src/lib/room_memory';

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
