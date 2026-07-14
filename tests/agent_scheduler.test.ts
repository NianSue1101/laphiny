import assert from 'node:assert/strict';
import test from 'node:test';

import { AgentTaskScheduler } from '../src/lib/agent_scheduler';

test('serializes the same room/Agent pair while other pairs run concurrently', async () => {
  const scheduler = new AgentTaskScheduler();
  const started: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = scheduler.schedule({ roomId: 'a', connectionId: 'one' }, async () => {
    started.push('a:one:first');
    await firstGate;
  });
  const second = scheduler.schedule({ roomId: 'a', connectionId: 'one' }, async () => {
    started.push('a:one:second');
  });
  const otherRoom = scheduler.schedule({ roomId: 'b', connectionId: 'one' }, async () => {
    started.push('b:one');
  });
  const otherAgent = scheduler.schedule({ roomId: 'a', connectionId: 'two' }, async () => {
    started.push('a:two');
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(started.sort(), ['a:one:first', 'a:two', 'b:one'].sort());
  assert.equal(scheduler.isBusy({ roomId: 'a', connectionId: 'one' }), true);

  releaseFirst();
  await Promise.all([first, second, otherRoom, otherAgent]);
  assert.equal(started.at(-1), 'a:one:second');
  assert.deepEqual(scheduler.activeKeys(), []);
});
