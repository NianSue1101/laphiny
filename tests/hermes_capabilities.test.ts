import assert from 'node:assert/strict';
import { test } from 'node:test';

import { evaluateHermesToolDelegationSupport } from '../src/lib/hermes_capabilities';

const capabilities = { features: { responses_api: true } };

test('accepts current Hermes toolsets envelope', () => {
  assert.deepEqual(evaluateHermesToolDelegationSupport(capabilities, {
    object: 'list',
    data: [{ name: 'laphiny', enabled: true, tools: ['laphiny_delegate_tasks'] }],
  }), {
    supported: true,
    compatibility: 'compatible',
    protocol: 'laphiny.delegation.v1',
  });
});
test('keeps compatibility with legacy toolsets arrays', () => {
  assert.equal(evaluateHermesToolDelegationSupport(capabilities, [
    { tools: ['laphiny_delegate_tasks'] },
  ]).supported, true);
});

test('distinguishes disabled, missing, incompatible and responses unavailable metadata', () => {
  assert.equal(evaluateHermesToolDelegationSupport(capabilities, {
    data: [{ enabled: false, tools: ['laphiny_delegate_tasks'] }],
  }).compatibility, 'plugin_disabled');
  assert.equal(evaluateHermesToolDelegationSupport(capabilities, { data: [] }).compatibility, 'plugin_missing');
  assert.equal(evaluateHermesToolDelegationSupport(capabilities, {}).compatibility, 'metadata_incompatible');
  assert.equal(evaluateHermesToolDelegationSupport({ features: {} }, { data: [] }).compatibility, 'responses_unavailable');
});
