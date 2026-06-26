import assert from 'node:assert/strict';
import test from 'node:test';

import { appendDiagnosticLog, buildDiagnosticBundle, makeDiagnosticLog, sanitizeDiagnosticLogs } from '../src/lib/diagnostics';
import type { DiagnosticLogEntry } from '../src/types';

test('appendDiagnosticLog keeps recent entries sorted and capped', () => {
  let logs: DiagnosticLogEntry[] = [];
  for (let i = 0; i < 205; i += 1) {
    logs = appendDiagnosticLog(logs, makeDiagnosticLog({
      id: `log_${i}`,
      level: 'info',
      category: 'chat',
      title: `log ${i}`,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    }));
  }

  assert.equal(logs.length, 200);
  assert.equal(logs[0].id, 'log_5');
  assert.equal(logs.at(-1)?.id, 'log_204');
});

test('sanitizeDiagnosticLogs drops invalid values and caps output', () => {
  const logs = sanitizeDiagnosticLogs([
    null,
    { title: 'missing fields' },
    { id: 'ok', level: 'success', category: 'sync', title: 'ok', createdAt: '2026-01-01T00:00:00.000Z' },
  ]);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].id, 'ok');
});

test('buildDiagnosticBundle redacts secrets', () => {
  const bundle = buildDiagnosticBundle({
    appVersion: 'test',
    connections: [{
      id: 'conn_1',
      name: 'SecretAgent',
      baseUrl: 'https://user:pass@example.com/hermes?token=abc123',
      apiKey: 'super-secret-key',
      model: 'hermes-agent',
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }],
    rooms: [],
    messagesByRoom: {},
    diagnosticLogs: [makeDiagnosticLog({
      level: 'error',
      category: 'sync',
      title: 'failed',
      message: 'Bearer abcdefghijklmnopqrstuvwxyz123456',
      meta: { apiKey: 'abc', token: 'def' },
    })],
  });

  assert.match(bundle, /hasApiKey/);
  assert.doesNotMatch(bundle, /super-secret-key/);
  assert.doesNotMatch(bundle, /abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(bundle, /token=abc123/);
});
