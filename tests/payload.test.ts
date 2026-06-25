import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAttachmentContext, buildHermesUserContent } from '../src/lib/payload';
import { Attachment } from '../src/types';

const textAttachment: Attachment = {
  id: 'a1',
  name: 'notes.txt',
  mimeType: 'text/plain',
  kind: 'text',
  text: 'hello from file',
};

const imageAttachment: Attachment = {
  id: 'a2',
  name: 'cat.png',
  mimeType: 'image/png',
  kind: 'image',
  dataUrl: 'data:image/png;base64,AAAA',
};

test('buildAttachmentContext wraps text files as bounded attachment blocks', () => {
  const context = buildAttachmentContext([textAttachment]);

  assert.match(context, /<attachment name="notes\.txt" type="text\/plain">/);
  assert.match(context, /hello from file/);
});

test('buildHermesUserContent keeps text-only messages as string', () => {
  const content = buildHermesUserContent('read this', [textAttachment]);

  assert.equal(typeof content, 'string');
  assert.match(content as string, /read this/);
  assert.match(content as string, /hello from file/);
});

test('buildHermesUserContent emits image_url parts for images', () => {
  const content = buildHermesUserContent('what is this?', [imageAttachment]);

  assert.ok(Array.isArray(content));
  assert.deepEqual(content[0], { type: 'text', text: 'what is this?' });
  assert.deepEqual(content[1], {
    type: 'image_url',
    image_url: {
      url: 'data:image/png;base64,AAAA',
      detail: 'auto',
    },
  });
});

test('buildHermesUserContent preserves both text attachment and image', () => {
  const content = buildHermesUserContent('combine', [textAttachment, imageAttachment]);

  assert.ok(Array.isArray(content));
  assert.match(content[0]!.type === 'text' ? content[0]!.text : '', /hello from file/);
  assert.equal(content[1]!.type, 'image_url');
});
