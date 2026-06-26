import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRitualPrompt, parseCollaborationRitualCommand } from '../src/lib/collaboration_rituals';
import type { Room } from '../src/types';

const room: Room = {
  id: 'room-1',
  name: 'Test Room',
  kind: 'group',
  members: [
    { connectionId: 'a', alias: 'Flor', enabled: true },
    { connectionId: 'b', alias: 'Laper', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'key',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('collaboration rituals', () => {
  it('parses slash commands', () => {
    const parsed = parseCollaborationRitualCommand('/redteam 检查上线风险');
    assert.equal(parsed?.definition.id, 'redteam');
    assert.equal(parsed?.topic, '检查上线风险');
  });

  it('builds a prompt with room member order', () => {
    const parsed = parseCollaborationRitualCommand('/council 下一步做什么');
    assert.ok(parsed);
    const prompt = buildRitualPrompt(parsed!, room);
    assert.match(prompt, /议会模式/);
    assert.match(prompt, /Flor/);
    assert.match(prompt, /Laper/);
  });
});
