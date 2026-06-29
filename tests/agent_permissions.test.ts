import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAgentPermissionDecisionPrompt, extractAgentPermissionRequest } from '../src/lib/agent_permissions';

test('extracts structured laphiny permission blocks', () => {
  const result = extractAgentPermissionRequest([
    '我需要先确认。',
    '```laphiny-permission',
    '{"title":"允许写文件","action":"write result.txt","reason":"保存产物"}',
    '```',
  ].join('\n'), '2026-06-29T00:00:00.000Z');

  assert.equal(result.content, '我需要先确认。');
  assert.equal(result.request?.title, '允许写文件');
  assert.equal(result.request?.action, 'write result.txt');
  assert.equal(result.request?.status, 'pending');
});

test('detects plain permission request text', () => {
  const result = extractAgentPermissionRequest('需要你的权限确认：是否同意执行该操作？可以同意、拒绝或总是同意。');

  assert.equal(result.request?.title, '需要你的确认');
  assert.equal(result.request?.status, 'pending');
});

test('builds decision prompt without requiring a visible user message', () => {
  const result = extractAgentPermissionRequest('PERMISSION_REQUEST: {"title":"运行构建","body":"需要确认"}');
  assert.ok(result.request);

  const prompt = buildAgentPermissionDecisionPrompt(result.request!, 'always');

  assert.match(prompt, /总是同意/);
  assert.match(prompt, /继续刚才被权限请求中断的任务/);
});
