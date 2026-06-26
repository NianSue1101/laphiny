import assert from 'node:assert/strict';
import test from 'node:test';

import { formatAgentProfileForPrompt, parseAgentProfileResponse } from '../src/lib/agent_profile';

test('parses agent profile JSON from plain response', () => {
  const profile = parseAgentProfileResponse(JSON.stringify({
    soulName: 'Laper',
    publicPersona: '工程型协作者。',
    personality: '直接、理性、重视可执行结果。',
    strengths: ['代码实现', '构建部署', '错误排查'],
    delegateWhen: ['需要修改代码', '需要排查构建错误'],
    avoidWhen: ['纯视觉审美定稿'],
    collaborationStyle: '先定位问题，再给出最小可行修改。',
  }), 'Laper');

  assert.equal(profile.soulName, 'Laper');
  assert.deepEqual(profile.strengths.slice(0, 2), ['代码实现', '构建部署']);
  assert.equal(profile.source, 'self-report');
});

test('parses agent profile JSON from fenced response', () => {
  const profile = parseAgentProfileResponse(`\n\`\`\`json\n{\n  "publicPersona": "温柔的整理者",\n  "strengths": ["总结"],\n  "delegateWhen": ["需要整理上下文"],\n  "avoidWhen": [],\n  "collaborationStyle": "先理解再归纳"\n}\n\`\`\``, 'Flor');

  assert.equal(profile.soulName, 'Flor');
  assert.equal(profile.publicPersona, '温柔的整理者');
});

test('formats profile for collaboration prompt', () => {
  const text = formatAgentProfileForPrompt('Flor', {
    soulName: 'Flor',
    publicPersona: '稳定的上下文整理者',
    personality: '耐心细腻',
    strengths: ['需求澄清'],
    delegateWhen: ['需求混乱时'],
    avoidWhen: [],
    collaborationStyle: '先澄清再总结',
    source: 'self-report',
    updatedAt: '2026-06-27T00:00:00.000Z',
  });

  assert.match(text, /人格摘要：稳定的上下文整理者/);
  assert.match(text, /适合委托：需求混乱时/);
});
