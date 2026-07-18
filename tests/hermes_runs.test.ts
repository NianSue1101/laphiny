import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HermesClient,
  HermesHttpError,
  HermesTransportError,
  supportsHermesDurableRuns,
} from '../src/lib/hermes_client';

test('probes durable run capabilities without inferring support from unrelated fields', async () => {
  const client = new HermesClient({ baseUrl: 'https://example.invalid/', apiKey: 'secret' }, async (input, init) => {
    assert.equal(String(input), 'https://example.invalid/v1/capabilities');
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer secret');
    return Response.json({
      features: {
        run_submission: true,
        run_status: true,
        run_events_sse: false,
      },
    });
  });

  const capabilities = await client.capabilities({ timeoutMs: 1_000 });
  assert.equal(supportsHermesDurableRuns(capabilities), true);
  assert.equal(supportsHermesDurableRuns({ features: { run_submission: true } }), false);
});

test('submits a run with stable session identity in both body and Hermes headers', async () => {
  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: 'secret' }, async (input, init) => {
    assert.equal(String(input), 'https://example.invalid/v1/runs');
    assert.equal(init?.method, 'POST');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer secret');
    assert.equal(headers.get('x-hermes-session-id'), 'room-agent-session');
    assert.equal(headers.get('x-hermes-session-key'), 'room-memory-scope');
    assert.deepEqual(JSON.parse(String(init?.body)), {
      input: 'continue the task',
      model: 'hermes-agent',
      session_id: 'room-agent-session',
    });
    return Response.json({ run_id: 'run_123', status: 'started' }, { status: 202 });
  });

  const result = await client.createRun(
    { input: 'continue the task', model: 'hermes-agent' },
    { sessionId: 'room-agent-session', sessionKey: 'room-memory-scope' },
  );
  assert.deepEqual(result, { run_id: 'run_123', status: 'started' });
});

test('parses run deltas, tool lifecycle, reasoning, and terminal output from SSE', async () => {
  const body = [
    ': keepalive',
    '',
    'data: {"event":"message.delta","run_id":"run_123","delta":"partial ","timestamp":1}',
    '',
    'data: {"event":"reasoning.available","run_id":"run_123","text":"checked state"}',
    '',
    'data: {"event":"tool.started","run_id":"run_123","tool":"terminal","preview":"run tests"}',
    '',
    'data: {"event":"tool.completed","run_id":"run_123","tool":"terminal","error":false}',
    '',
    'data: {"event":"run.completed","run_id":"run_123","output":"partial complete"}',
    '',
  ].join('\n');
  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, async (input, init) => {
    assert.equal(String(input), 'https://example.invalid/v1/runs/run_123/events');
    assert.equal(new Headers(init?.headers).get('x-hermes-session-key'), 'room-scope');
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  });

  const events = [];
  for await (const event of client.runEvents('run_123', { sessionKey: 'room-scope' })) events.push(event);

  assert.equal(events[0]?.content, 'partial ');
  assert.equal(events[1]?.reasoning, 'checked state');
  assert.deepEqual(events[2]?.toolCall, {
    name: 'terminal',
    label: 'run tests',
    callId: undefined,
    status: 'running',
  });
  assert.equal(events[3]?.toolCall?.status, 'completed');
  assert.equal(events[4]?.status, 'completed');
  assert.equal(events[4]?.output, 'partial complete');
});

test('polls final run output and stops through typed run endpoints', async () => {
  const calls: string[] = [];
  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method} ${url}`);
    if (url.endsWith('/stop')) {
      return Response.json({ run_id: 'run%2Funsafe', status: 'stopping' });
    }
    return Response.json({
      object: 'hermes.run',
      run_id: 'run/unsafe',
      status: 'completed',
      output: 'durable final answer',
    });
  });

  const status = await client.getRun('run/unsafe');
  const stopped = await client.stopRun('run/unsafe');
  assert.equal(status.output, 'durable final answer');
  assert.equal(stopped.status, 'stopping');
  assert.deepEqual(calls, [
    'GET https://example.invalid/v1/runs/run%2Funsafe',
    'POST https://example.invalid/v1/runs/run%2Funsafe/stop',
  ]);
});

test('surfaces old Gateway 404 as a typed compatibility error', async () => {
  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, async () => (
    Response.json({ error: { code: 'run_not_found' } }, { status: 404 })
  ));

  await assert.rejects(
    () => client.getRun('missing'),
    (error) => error instanceof HermesHttpError && error.status === 404 && error.body.includes('run_not_found'),
  );
});

test('honors an already-aborted external signal before starting a run request', async () => {
  let sawAbortedSignal = false;
  const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, ((_: RequestInfo | URL, init?: RequestInit) => {
    sawAbortedSignal = init?.signal?.aborted === true;
    const error = new Error('aborted');
    error.name = 'AbortError';
    return Promise.reject(error);
  }) as typeof fetch);
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => client.createRun({ input: 'never starts' }, { signal: controller.signal }),
    (error) => error instanceof Error && error.name === 'AbortError',
  );
  assert.equal(sawAbortedSignal, true);
});

test('applies connection and per-chunk idle timeouts to run event streams', async (t) => {
  await t.test('connection timeout', async () => {
    const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, ((_: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      })
    )) as typeof fetch);
    await assert.rejects(
      () => client.runEvents('run_123', { connectTimeoutMs: 10 }).next(),
      (error) => error instanceof HermesTransportError && error.kind === 'connect_timeout',
    );
  });

  await t.test('idle timeout', async () => {
    const client = new HermesClient({ baseUrl: 'https://example.invalid', apiKey: '' }, async () => (
      new Response(new ReadableStream<Uint8Array>({ start() {} }), {
        headers: { 'content-type': 'text/event-stream' },
      })
    ));
    await assert.rejects(
      () => client.runEvents('run_123', { idleTimeoutMs: 10 }).next(),
      (error) => error instanceof HermesTransportError && error.kind === 'stream_idle_timeout',
    );
  });
});
