import assert from 'node:assert/strict';
import test from 'node:test';

import { getChatNoticeAction } from '../src/lib/chat_notice_actions';
import type { ChatMessage } from '../src/types';

function notice(content: string, noticeActionId?: ChatMessage['noticeActionId']): ChatMessage {
  return {
    id: 'notice',
    roomId: 'room',
    role: 'assistant',
    authorId: 'system',
    authorName: 'Laphiny',
    content,
    noticeActionId,
    status: 'local',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

test('explicit notice actions map to focused chat settings', () => {
  assert.equal(getChatNoticeAction(notice('提示', 'delegation-limit'))?.label, '调整委托上限');
  assert.equal(getChatNoticeAction(notice('提示', 'memory'))?.label, '处理记忆草案');
});

test('legacy notices receive the same quick actions from their content', () => {
  assert.equal(getChatNoticeAction(notice('普通模式本轮最多接收 1 个委托，已忽略 2 个额外委托。'))?.id, 'delegation-limit');
  assert.equal(getChatNoticeAction(notice('目标连续两轮没有结构化进展，已暂停并等待用户调整。'))?.id, 'goal');
  assert.equal(getChatNoticeAction(notice('桌游店 RP 模式已关闭。群聊恢复普通协作触发规则。'))?.id, 'roleplay');
});

test('result notices and ordinary agent replies stay action-free', () => {
  assert.equal(getChatNoticeAction(notice('本轮共识总结：完成。')), null);
  assert.equal(getChatNoticeAction({ ...notice('普通模式本轮最多接收 1 个委托。'), authorId: 'agent' }), null);
});
