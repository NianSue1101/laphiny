import assert from 'node:assert/strict';
import test from 'node:test';

import { runOrResumeHermesDurableCompletion } from '../src/lib/hermes_runs';
import type { HermesConnection } from '../src/types';

test('durable completion returns authoritative polled output', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const encoder = new TextEncoder();
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/v1/capabilities')) {
      return Response.json({ features: { run_submission: true, run_status: true, run_events_sse: true } });
    }
    if (url.endsWith('/v1/runs')) return Response.json({ run_id: 'run_durable', status: 'started' }, { status: 202 });
    if (url.endsWith('/v1/runs/run_durable/events')) {
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode([
            'data: {"event":"message.delta","run_id":"run_durable","delta":"partial"}',
            '',
            'data: {"event":"run.completed","run_id":"run_durable","output":"final answer"}',
            '',
            '',
          ].join('\n')));
          controller.close();
        },
      }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (url.endsWith('/v1/runs/run_durable')) {
      return Response.json({ run_id: 'run_durable', status: 'completed', output: 'final answer' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const connection: HermesConnection = {
    id: 'durable-test',
    name: 'Durable',
    baseUrl: 'https://durable.example.invalid',
    apiKey: '',
    model: 'hermes-agent',
    enabled: true,
    createdAt: '2026-07-18T00:00:00.000Z',
    updatedAt: '2026-07-18T00:00:00.000Z',
  };
  const submitted: string[] = [];
  const progress: string[] = [];
  try {
    const result = await runOrResumeHermesDurableCompletion({
      connection,
      messages: [{ role: 'user', content: 'hello' }],
      signal: new AbortController().signal,
      onRunSubmitted: (runId) => submitted.push(runId),
      onProgress: (item) => progress.push(item.content),
    });

    assert.equal(result.runId, 'run_durable');
    assert.equal(result.content, 'final answer');
    assert.deepEqual(submitted, ['run_durable']);
    assert(progress.includes('partial'));
    assert(calls.some((url) => url.endsWith('/v1/runs/run_durable')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resume by run id skips capability probing and does not submit duplicate work', async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/events')) return new Response('', { status: 404 });
    if (url.endsWith('/v1/runs/run_existing')) {
      return Response.json({ run_id: 'run_existing', status: 'completed', output: 'recovered' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;
  const connection: HermesConnection = {
    id: 'resume-test', name: 'Resume', baseUrl: 'https://resume.example.invalid', apiKey: '', model: 'hermes-agent', enabled: true,
    createdAt: '2026-07-18T00:00:00.000Z', updatedAt: '2026-07-18T00:00:00.000Z',
  };
  try {
    const result = await runOrResumeHermesDurableCompletion({
      connection,
      messages: [],
      runId: 'run_existing',
      signal: new AbortController().signal,
    });
    assert.equal(result.content, 'recovered');
    assert(!calls.some((url) => url.endsWith('/v1/capabilities')));
    assert(!calls.some((url) => url.endsWith('/v1/runs')));
    assert(!calls.some((url) => url.endsWith('/events')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
