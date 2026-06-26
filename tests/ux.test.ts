import assert from 'node:assert/strict';
import { getSlashCommandSuggestions, getUxCommandKindLabel } from '../src/lib/ux';

assert.equal(getSlashCommandSuggestions('hello').length, 0);
assert.equal(getSlashCommandSuggestions('/rp')[0]?.command, '/rp');
assert.ok(getSlashCommandSuggestions('/re').some((item) => item.command === '/redteam'));
assert.ok(getSlashCommandSuggestions('/council').some((item) => item.kind === 'ritual'));
assert.equal(getUxCommandKindLabel('roleplay'), '角色扮演');

console.log('ux tests passed');
