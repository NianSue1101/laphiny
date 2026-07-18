import assert from 'node:assert/strict';
import test from 'node:test';

import { LaphinySyncClient, sha256Hex, splitUtf8Text } from '../src/lib/sync_client';
import type { ProactiveAgentMessageEvent, SyncSnapshot } from '../src/types';

test('portable SHA-256 and UTF-8 splitting preserve multilingual snapshot bytes', () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const value = 'ASCII/中文/🌸/'.repeat(20);
  const parts = splitUtf8Text(value, 17);
  assert.equal(parts.join(''), value);
  assert.ok(parts.every((part) => new TextEncoder().encode(part).length <= 17));
});

test('honors sync request signals that were already aborted', async () => {
  let receivedAbortedSignal = false;
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    receivedAbortedSignal = init?.signal?.aborted === true;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  }) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example', apiKey: '' }, fetchImpl);
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => client.health({ signal: controller.signal }),
    (error: unknown) => error instanceof Error && error.name === 'AbortError',
  );
  assert.equal(receivedAbortedSignal, true);
});

test('small snapshots keep the legacy single-request protocol', async () => {
  const calls: string[] = [];
  const snapshot = makeSnapshot('small');
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return Response.json(snapshot);
  }) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example', apiKey: '' }, fetchImpl);
  const result = await client.pushSnapshot(snapshot);
  assert.equal(result.messagesByRoom.room_1?.[0]?.content, 'small');
  assert.deepEqual(calls, ['PUT https://sync.example/v1/snapshot']);
});

test('large snapshots negotiate resumable transfer and query status before retrying an ambiguous part', async () => {
  const snapshot = makeSnapshot('中文🌸'.repeat(70_000));
  const calls: Array<{ url: string; method: string; body?: string }> = [];
  const receivedParts = new Set<number>();
  const uploadedBodies = new Map<number, string>();
  let failedFirstPart = false;
  let transferId = '';
  let totalParts = 0;
  const status = (state: 'uploading' | 'committed' = 'uploading') => ({
    protocol: 'laphiny.snapshot-transfer.v1',
    transferId,
    state,
    sha256: 'unused',
    totalBytes: new TextEncoder().encode(JSON.stringify(snapshot)).length,
    totalParts,
    receivedBytes: 0,
    receivedParts: [...receivedParts].sort((a, b) => a - b),
    baseRevision: 4,
    committedRevision: state === 'committed' ? 5 : undefined,
    expiresAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    calls.push({ url, method, body });
    if (url.endsWith('/v1/health')) {
      return Response.json({
        status: 'ok',
        syncRevision: 4,
        capabilities: { snapshotTransfers: { protocol: 'laphiny.snapshot-transfer.v1', maxPartBytes: 64 * 1024, maxTransferBytes: 10_000_000, maxParts: 100 } },
      });
    }
    if (url.endsWith('/v1/snapshot-transfers') && method === 'POST') {
      const manifest = JSON.parse(body!);
      transferId = manifest.transferId;
      totalParts = manifest.totalParts;
      return Response.json(status());
    }
    const partMatch = url.match(/\/parts\/(\d+)$/u);
    if (partMatch && method === 'PUT') {
      const index = Number(partMatch[1]);
      receivedParts.add(index);
      uploadedBodies.set(index, body!);
      if (index === 0 && !failedFirstPart) {
        failedFirstPart = true;
        throw new TypeError('connection reset after server accepted part');
      }
      return Response.json(status());
    }
    if (url.endsWith(`/snapshot-transfers/${transferId}`) && method === 'GET') return Response.json(status());
    if (url.endsWith('/commit') && method === 'POST') return Response.json(status('committed'));
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example', apiKey: 'key' }, fetchImpl);
  const result = await client.pushSnapshot(snapshot, { timeoutMs: 5_000 });

  assert.equal(result, snapshot);
  assert.match(transferId, /^snapshot_[a-f0-9]{64}$/u);
  assert.equal([...uploadedBodies.entries()].sort(([a], [b]) => a - b).map(([, body]) => body).join(''), JSON.stringify(snapshot));
  assert.equal(calls.filter((call) => call.url.endsWith('/parts/0') && call.method === 'PUT').length, 1);
  assert.equal(calls.filter((call) => call.url.endsWith(`/snapshot-transfers/${transferId}`) && call.method === 'GET').length, 1);
});

test('large snapshots explain that a legacy 413 backend must be upgraded', async () => {
  const snapshot = makeSnapshot('x'.repeat(220_000));
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/v1/health')) return Response.json({ status: 'ok' });
    return Response.json({ error: 'payload_too_large', message: 'too large' }, { status: 413 });
  }) as typeof globalThis.fetch;
  const client = new LaphinySyncClient({ baseUrl: 'https://sync.example', apiKey: '' }, fetchImpl);
  await assert.rejects(() => client.pushSnapshot(snapshot), /升级 laphiny-sync 后端/u);
});

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

function makeSnapshot(content: string): SyncSnapshot {
  const createdAt = '2026-07-18T00:00:00.000Z';
  return {
    connections: [],
    rooms: [],
    messagesByRoom: {
      room_1: [{
        id: 'message_1',
        roomId: 'room_1',
        role: 'assistant',
        authorId: 'conn_1',
        authorName: 'Flor',
        content,
        status: 'sent',
        createdAt,
      }],
    },
    squareEvents: [],
    updatedAt: createdAt,
  };
}
