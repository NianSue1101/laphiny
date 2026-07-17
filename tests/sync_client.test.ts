import assert from 'node:assert/strict';
import test from 'node:test';

import { LaphinySyncClient } from '../src/lib/sync_client';
import type { ProactiveAgentMessageEvent } from '../src/types';

test('streams authenticated proactive Agent SSE events from a recovery cursor', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const event = makeEvent(7);
  const encoder = new TextEncoder();
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(': connected\n\n'));
        const frame = `id: 7\nevent: proactive-message\ndata: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(frame.slice(0, 35)));
        controller.enqueue(encoder.encode(frame.slice(35)));
        controller.close();
      },
    }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  }) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example/', apiKey: 'admin-key' }, fetchImpl);

  const received: ProactiveAgentMessageEvent[] = [];
  for await (const item of client.streamAgentMessages({ after: 6 })) received.push(item);

  assert.equal(calls[0]?.url, 'https://sync.example/v1/agent/stream?after=6');
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, 'Bearer admin-key');
  assert.equal(received.length, 1);
  assert.equal(received[0]?.eventId, 'event_7');
  assert.equal(received[0]?.message.content, '主动回复 7');
});

test('ignores SSE heartbeats, malformed JSON and unrelated event names', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode([
        ': heartbeat',
        '',
        'event: other',
        'data: {}',
        '',
        'event: proactive-message',
        'data: {bad json}',
        '',
        '',
      ].join('\n')));
      controller.close();
    },
  }), { status: 200 })) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example', apiKey: '' }, fetchImpl);

  const received: ProactiveAgentMessageEvent[] = [];
  for await (const item of client.streamAgentMessages()) received.push(item);
  assert.deepEqual(received, []);
});

function makeEvent(sequence: number): ProactiveAgentMessageEvent {
  const createdAt = '2026-07-17T03:00:00.000Z';
  return {
    protocol: 'laphiny.proactive-message.v1',
    sequence,
    eventId: `event_${sequence}`,
    roomId: 'room_1',
    connectionId: 'conn_1',
    authorName: 'Flor',
    idempotencyKey: `timer:${sequence}`,
    message: {
      id: `message_${sequence}`,
      roomId: 'room_1',
      role: 'assistant',
      authorId: 'conn_1',
      authorName: 'Flor',
      content: `主动回复 ${sequence}`,
      status: 'sent',
      origin: 'proactive',
      inboundEventId: `event_${sequence}`,
      createdAt,
    },
    createdAt,
  };
}
