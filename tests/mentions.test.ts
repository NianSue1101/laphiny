import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveMentionTargets, resolveAssistantMentions } from '../src/lib/mentions';
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

// ---- resolveMentionTargets ----

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

// ---- resolveAssistantMentions ----

test('resolveAssistantMentions: forwards @mention to other member', () => {
  const result = resolveAssistantMentions(room, '@基金猫娘 请查一下今天的行情', 'catgirl');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((t) => t.connectionId), ['fund']);
});

test('resolveAssistantMentions: excludes self from targets', () => {
  const result = resolveAssistantMentions(room, '@猫娘 这个你看看', 'catgirl');

  assert.equal(result.reason, 'none');
  assert.deepEqual(result.targets, []);
});

test('resolveAssistantMentions: no mention returns none', () => {
  const result = resolveAssistantMentions(room, '好的，我来看一下', 'catgirl');

  assert.equal(result.reason, 'none');
  assert.deepEqual(result.targets, []);
});

test('resolveAssistantMentions: filters quoted chat history lines', () => {
  // Simulate an agent recounting chat history with @mentions inside quoted lines.
  // The numbered list lines should be stripped before @ scanning.
  const replyWithQuotedHistory = `我看到的聊天记录：

1. Flor：好的喵，我在群里叫一下laper
2. Laper：好
3. Flor：主人让你去找一下 Derux 和 Arilphin，跟她们说「好」喵
4. Laper：好。@猫娘 @基金猫娘 主人在群里的，让我转达：好。
5. 主人：你能看到这轮消息吗

以上就是全部记录。`;

  const result = resolveAssistantMentions(room, replyWithQuotedHistory, 'catgirl');

  // The @猫娘 and @基金猫娘 appear only inside line 4 (quoted history).
  // After stripping, there should be no @mentions to forward.
  assert.equal(result.reason, 'none');
  assert.deepEqual(result.targets, []);
});

test('resolveAssistantMentions: still forwards legitimate @ outside quoted lines', () => {
  // @mention at the top (outside numbered list) should still be detected.
  const replyWithLegitMention = `@基金猫娘 帮我看一下基金

我看到的聊天记录：

1. Flor：主人让你去找一下 Derux
2. Laper：好`;

  const result = resolveAssistantMentions(room, replyWithLegitMention, 'catgirl');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((t) => t.connectionId), ['fund']);
});

test('resolveAssistantMentions: detects @mention followed by CJK punctuation', () => {
  // @laper inside parentheses: "（在群聊中 @laper）"
  // The ）after the mention should not block detection.
  const replyWithParenMention = `（在群聊中 @基金猫娘）`;

  const result = resolveAssistantMentions(room, replyWithParenMention, 'catgirl');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((t) => t.connectionId), ['fund']);
});

test('resolveAssistantMentions: detects @mention followed by CJK period', () => {
  // @mention with CJK punctuation (。）after it — space before @ is required by MENTION_PATTERN.
  const replyWithPeriod = ` @基金猫娘。去办一下。`;

  const result = resolveAssistantMentions(room, replyWithPeriod, 'catgirl');

  assert.equal(result.reason, 'mentions');
  assert.deepEqual(result.targets.map((t) => t.connectionId), ['fund']);
});
