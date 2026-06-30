import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runHermesCompletion } from '../src/lib/hermes_completion';
import type { HermesChatCompletionRequest, HermesChatCompletionResponse } from '../src/types';

const request: HermesChatCompletionRequest = {
  model: 'test-model',
  messages: [{ role: 'user', content: 'hello' }],
};

test('runHermesCompletion uses non-streaming completions when streaming is disabled', async () => {
  const calls: Array<{ stream?: boolean; sessionId?: string; timeoutMs?: number }> = [];
  const client = {
    async chatCompletion(
      currentRequest: HermesChatCompletionRequest,
      options: { sessionId?: string; timeoutMs?: number },
    ): Promise<HermesChatCompletionResponse> {
      calls.push({
        stream: currentRequest.stream,
        sessionId: options.sessionId,
        timeoutMs: options.timeoutMs,
      });
      return {
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'background reply complete' },
          },
        ],
      };
    },
  };

  const result = await runHermesCompletion(client as never, {
    request,
    sessionId: 'room-session',
    timeoutMs: 180_000,
    stream: false,
  });

  assert.equal(result, 'background reply complete');
  assert.deepEqual(calls, [
    { stream: false, sessionId: 'room-session', timeoutMs: 180_000 },
  ]);
});

test('runHermesCompletion accumulates streaming chunks and reports progress', async () => {
  const progress: string[] = [];
  const client = {
    async *chatCompletionStream(currentRequest: HermesChatCompletionRequest) {
      assert.equal(currentRequest.stream, true);
      yield 'hello';
      yield ' ';
      yield 'stream';
    },
  };

  const result = await runHermesCompletion(client as never, {
    request,
    stream: true,
    onChunk: (content) => progress.push(content),
  });

  assert.equal(result, 'hello stream');
  assert.deepEqual(progress, ['hello', 'hello ', 'hello stream']);
});
