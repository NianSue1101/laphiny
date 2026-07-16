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

test('chatCompletionStreamEvents keeps service-provided reasoning separate from visible content', async () => {
  globalThis.fetch = (async () => new Response([
    'data: {"choices":[{"delta":{"reasoning_content":"先检查约束。"}}]}',
    '',
    'data: {"choices":[{"delta":{"content":"可以开始。"}}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const events = [];
  for await (const event of client.chatCompletionStreamEvents({ model: 'test-model', messages: [], stream: true })) {
    events.push(event);
  }

  assert.deepEqual(events, [
    { reasoning: '先检查约束。' },
    { content: '可以开始。' },
  ]);
});

test('responseStreamEvents preserves structured Hermes function calls', async () => {
  globalThis.fetch = (async () => new Response([
    'event: response.output_item.added',
    'data: {"item":{"type":"function_call","name":"laphiny_delegate_tasks","arguments":"{\\"tasks\\":[]}","call_id":"call_1"}}',
    '',
    'event: response.output_text.delta',
    'data: {"delta":"已委托。"}',
    '',
  ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const events = [];
  for await (const event of client.responseStreamEvents({ model: 'test-model', input: 'hello' })) events.push(event);

  assert.deepEqual(events, [
    {
      toolCall: { name: 'laphiny_delegate_tasks', arguments: '{"tasks":[]}', callId: 'call_1', status: 'running' },
      activity: {
        id: 'call_1',
        tool: 'laphiny_delegate_tasks',
        label: '正在执行 laphiny_delegate_tasks',
        status: 'running',
      },
    },
    { content: '已委托。' },
  ]);
});

test('chatCompletionStreamEvents preserves Hermes tool progress without mixing it into reply text', async () => {
  globalThis.fetch = (async () => new Response([
    'event: hermes.tool.progress',
    'data: {"tool":"memory","label":"更新长期记忆","toolCallId":"tool_1","status":"running"}',
    '',
    'data: {"choices":[{"delta":{"content":"处理完成。"}}]}',
    '',
    'event: hermes.tool.progress',
    'data: {"tool":"memory","label":"长期记忆已更新","toolCallId":"tool_1","status":"completed"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const events = [];
  for await (const event of client.chatCompletionStreamEvents({ model: 'test-model', messages: [], stream: true })) events.push(event);

  assert.deepEqual(events, [
    { activity: { id: 'tool_1', tool: 'memory', label: '更新长期记忆', status: 'running' } },
    { content: '处理完成。' },
    { activity: { id: 'tool_1', tool: 'memory', label: '长期记忆已更新', status: 'completed' } },
  ]);
});

test('chatCompletionStreamEvents yields the first delayed SSE chunk before completion', async () => {
  let completed = false;
  globalThis.fetch = (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"先"}}]}\n\n'));
      setTimeout(() => {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"后"}}]}\n\ndata: [DONE]\n\n'));
        completed = true;
        controller.close();
      }, 20);
    },
  }), { status: 200, headers: { 'content-type': 'text/event-stream' } })) as typeof fetch;

  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' });
  const iterator = client.chatCompletionStream({ model: 'test-model', messages: [], stream: true });
  const first = await iterator.next();
  assert.deepEqual(first, { value: '先', done: false });
  assert.equal(completed, false);
  const second = await iterator.next();
  assert.deepEqual(second, { value: '后', done: false });
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
