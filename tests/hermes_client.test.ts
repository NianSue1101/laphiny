import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

import { HermesClient, normalizeHermesReplyText } from '../src/lib/hermes_client';

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

test('chatCompletionStream parses text/event-stream fallback bodies', async () => {
  globalThis.fetch = (async () => {
    const response = new Response([
      'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"delta":{"content":"你"},"finish_reason":null}]}',
      '',
      'data: {"choices":[{"delta":{"content":"好"},"finish_reason":null}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
    Object.defineProperty(response, 'body', { value: null });
    return response;
  }) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const chunks: string[] = [];
  for await (const chunk of client.chatCompletionStream({ model: 'test-model', messages: [], stream: true })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['你好']);
});

test('chatCompletionStream parses readable JSONL chunks without data prefix', async () => {
  globalThis.fetch = (async () => new Response([
    '{"choices":[{"delta":{"content":"流"}}]}',
    '{"choices":[{"delta":{"content":"式"}}]}',
    '{"choices":[{"message":{"role":"assistant","content":"完成"}}]}',
    '[DONE]',
    '',
  ].join('\n'), {
    status: 200,
    headers: { 'content-type': 'application/x-ndjson' },
  })) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const chunks: string[] = [];
  for await (const chunk of client.chatCompletionStream({ model: 'test-model', messages: [], stream: true })) {
    chunks.push(chunk);
  }

  assert.deepEqual(chunks, ['流', '式', '完成']);
});

test('normalizeHermesReplyText cleans stored raw SSE replies', () => {
  const raw = [
    'data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"任务"},"finish_reason":null}]}',
    'data: {"choices":[{"delta":{"content":"完成"},"finish_reason":null}]}',
    'data: [DONE]',
  ].join('\n');

  assert.equal(normalizeHermesReplyText(raw), '任务完成');
});
