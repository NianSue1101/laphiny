import assert from 'node:assert/strict';
import test from 'node:test';

import { extractAgentFileAttachments } from '../src/lib/agent_files';

test('extracts markdown file blocks from agent replies', () => {
  const result = extractAgentFileAttachments([
    'Here is the file.',
    '```laphiny-file name="notes.md" mime="text/markdown"',
    '# Notes',
    '',
    '- one',
    '```',
    'Done.',
  ].join('\n'));

  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.name, 'notes.md');
  assert.equal(result.attachments[0]?.kind, 'text');
  assert.match(result.attachments[0]?.text ?? '', /# Notes/);
  assert.equal(result.content, 'Here is the file.\n\nDone.');
});

test('extracts image file blocks from data URLs', () => {
  const result = extractAgentFileAttachments([
    'image attached',
    '```laphiny-file name="pixel.png" mime="image/png"',
    'data:image/png;base64,iVBORw0KGgo=',
    '```',
  ].join('\n'));

  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.name, 'pixel.png');
  assert.equal(result.attachments[0]?.kind, 'image');
  assert.equal(result.attachments[0]?.dataUrl, 'data:image/png;base64,iVBORw0KGgo=');
});

test('leaves unsupported file blocks visible', () => {
  const raw = '```laphiny-file name="secret.exe"\nnope\n```';
  const result = extractAgentFileAttachments(raw);

  assert.equal(result.attachments.length, 0);
  assert.equal(result.content, raw);
});

test('extracts filename plus text code block fallback', () => {
  const result = extractAgentFileAttachments([
    '下面是文件：',
    '文件名：notes.txt',
    '```txt',
    'hello from agent',
    '```',
  ].join('\n'));

  assert.equal(result.attachments.length, 1);
  assert.equal(result.attachments[0]?.name, 'notes.txt');
  assert.equal(result.attachments[0]?.kind, 'text');
  assert.equal(result.attachments[0]?.text, 'hello from agent');
  assert.equal(result.content, '下面是文件：');
});
