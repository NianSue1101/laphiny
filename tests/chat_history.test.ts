import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildCollaborationProtocol,
  buildDelegationSystemPrompt,
  buildGroupSystemPrompt,
} from '../src/app/chat_history';
import type { HermesConnection, Room } from '../src/types';

const room: Room = {
  id: 'room-1',
  name: '协作室',
  kind: 'group',
  members: [
    { connectionId: 'planner', alias: '规划师', enabled: true },
    { connectionId: 'reviewer', alias: '审查员', enabled: true },
  ],
  sessionIds: {},
  sessionKey: 'key',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const connections: HermesConnection[] = [
  {
    id: 'planner',
    name: '规划师连接',
    baseUrl: 'https://example.invalid',
    apiKey: '',
    model: 'model-a',
    enabled: true,
    profile: {
      publicPersona: '负责拆解复杂任务',
      personality: '结构化',
      strengths: ['计划拆解', '取舍判断'],
      delegateWhen: ['目标不清晰时'],
      avoidWhen: ['纯视觉审美'],
      collaborationStyle: '先定目标再拆步骤',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'reviewer',
    name: '审查员连接',
    baseUrl: 'https://example.invalid',
    apiKey: '',
    model: 'model-b',
    enabled: true,
    profile: {
      publicPersona: '负责发现风险',
      personality: '谨慎',
      strengths: ['风险审查', '边界检查'],
      delegateWhen: ['需要找漏洞时'],
      avoidWhen: [],
      collaborationStyle: '先列风险再给修正建议',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('chat prompt collaboration protocol', () => {
  it('encourages incremental work and bounded delegation in group prompts', () => {
    const prompt = buildGroupSystemPrompt(room, room.members[0]!, connections);

    assert.match(prompt, /增量推进/);
    assert.match(prompt, /普通模式下一次最多委托 1 个必要且彼此独立的子任务/);
    assert.match(prompt, /目标、输入材料、期望产物和边界/);
    assert.match(prompt, /不要带 @ 提到成员/);
    assert.match(prompt, /审查员/);
    assert.match(prompt, /风险审查/);
  });

  it('discourages delegation loops in delegated prompts', () => {
    const prompt = buildDelegationSystemPrompt(room, room.members[1]!, '规划师', connections);

    assert.match(prompt, /优先处理委托任务/);
    assert.match(prompt, /避免把任务再委托回 规划师/);
    assert.match(prompt, /普通模式下一次最多委托 1 个必要且彼此独立的子任务/);
  });

  it('writes the room delegation limit into the collaboration protocol', () => {
    const prompt = buildGroupSystemPrompt({ ...room, maxDelegationsPerRound: 3 }, room.members[0]!, connections);

    assert.match(prompt, /普通模式下一次最多委托 3 个必要且彼此独立的子任务/);
  });

  it('can produce a no-delegation protocol for future auxiliary agents', () => {
    const protocol = buildCollaborationProtocol({ allowDelegation: false }).join('\n');

    assert.match(protocol, /当前不应继续发起委托/);
    assert.match(protocol, /直接完成任务或说明缺少什么输入/);
  });
});
