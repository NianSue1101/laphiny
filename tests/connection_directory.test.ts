import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildMemberCapabilityGuide } from '../src/app/chat_history';
import { buildAgentConnectionDirectory, formatAgentConnectionDirectory } from '../src/lib/connection_directory';
import type { HermesConnection, Room, RoomMember } from '../src/types';

const now = '2026-07-16T00:00:00.000Z';
const members: RoomMember[] = [
  { connectionId: 'conn_lead', alias: 'Laper', enabled: true },
  { connectionId: 'conn_writer', alias: 'Purmihya', enabled: true },
  { connectionId: 'conn_disabled', alias: 'Disabled', enabled: false },
];
const room = {
  id: 'room_1', name: 'Test', kind: 'group', mode: 'manual', members,
  contextLimit: 20, sessionIds: {}, sessionKey: 'room-key', createdAt: now, updatedAt: now,
} as unknown as Room;
const connections = members.map((member) => ({
  id: member.connectionId,
  name: member.alias,
  baseUrl: `https://${member.alias}.invalid/private`,
  apiKey: `secret-${member.alias}`,
  model: 'test', enabled: member.enabled, createdAt: now, updatedAt: now,
})) as HermesConnection[];

test('agent connection directory exposes exact room-scoped IDs without connection secrets', () => {
  const entries = buildAgentConnectionDirectory(room, members[0]!, connections, (alias) => `${alias} profile`);
  const text = formatAgentConnectionDirectory(entries);

  assert.match(text, /"alias":"Laper"/u);
  assert.match(text, /"connection_id":"conn_writer"/u);
  assert.match(text, /"self":true/u);
  assert.doesNotMatch(text, /conn_disabled/u);
  assert.doesNotMatch(text, /https:\/\//u);
  assert.doesNotMatch(text, /secret-/u);
});

test('member capability guide uses the stable connection directory format', () => {
  const guide = buildMemberCapabilityGuide(room, members[0]!, connections);
  assert.match(guide, /"connection_id":"conn_lead"/u);
  assert.match(guide, /"connection_id":"conn_writer"/u);
});
