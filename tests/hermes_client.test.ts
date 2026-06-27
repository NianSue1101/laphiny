import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { HermesClient } from '../src/lib/hermes_client';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('chatCompletionStream falls back to non-readable JSON response bodies', async () => {
  globalThis.fetch = (async () => {
    const response = new Response(JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: '你好，已连接。',
          },
        },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    Object.defineProperty(response, 'body', { value: null });
    return response;
  }) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const chunks: string[] = [];
  for await (const chunk of client.chatCompletionStream({ model: 'test-model', messages: [], stream: true })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['你好，已连接。']);
});

test('chatCompletionStream falls back to non-readable plain text response bodies', async () => {
  globalThis.fetch = (async () => {
    const response = new Response('plain reply', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
    Object.defineProperty(response, 'body', { value: null });
    return response;
  }) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const chunks: string[] = [];
  for await (const chunk of client.chatCompletionStream({ model: 'test-model', messages: [], stream: true })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['plain reply']);
});
