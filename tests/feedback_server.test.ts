import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createApp } from '../scripts/feedback-server.mjs';

test('feedback server stores and lists authenticated feedback entries', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'laphiny-feedback-'));
  const server = createServer(createApp({ dataDir, apiKey: 'secret' }));
  await listen(server);
  const address = server.address();
  assert(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const unauthorized = await fetch(`${baseUrl}/v1/feedback`);
  assert.equal(unauthorized.status, 401);

  const posted = await fetch(`${baseUrl}/v1/feedback`, {
    method: 'POST',
    headers: { authorization: 'Bearer secret', 'content-type': 'application/json' },
    body: JSON.stringify({
      source: 'Laphiny App',
      appVersion: '0.14.0',
      platform: 'android',
      summary: 'diagnostic smoke test',
      diagnostics: { connections: [], rooms: [] },
    }),
  }).then((response) => response.json());

  assert.match(posted.id, /^feedback_/);
  assert.equal(posted.source, 'Laphiny App');
  assert.equal(posted.summary, 'diagnostic smoke test');

  const entries = await fetch(`${baseUrl}/v1/feedback?limit=10`, {
    headers: { authorization: 'Bearer secret' },
  }).then((response) => response.json());
  assert.equal(entries.length, 1);
  assert.equal(entries[0].id, posted.id);

  await close(server);
  await rm(dataDir, { recursive: true, force: true });
});

function listen(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
}

function close(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
