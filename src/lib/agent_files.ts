import type { Attachment } from '../types';

export interface AgentFileExtraction {
  content: string;
  attachments: Attachment[];
}

const FILE_BLOCK_PATTERN = /```laphiny-file\s*([^\n]*)\n([\s\S]*?)```/gi;
const FILENAME_CODE_BLOCK_PATTERN = /(?:^|\n)(?:\u6587\u4ef6\u540d|\u6a94\u540d|filename|file)\s*[:\uff1a]\s*([^\n]+\.(?:txt|md))\s*\n```(?:txt|text|md|markdown)?\s*\n([\s\S]*?)```/gi;
const SUPPORTED_TEXT_EXTENSIONS = new Set(['txt', 'md']);
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
};
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

export function extractAgentFileAttachments(rawContent: string): AgentFileExtraction {
  const attachments: Attachment[] = [];
  let content = rawContent.replace(FILE_BLOCK_PATTERN, (full, rawAttrs: string, rawBody: string) => {
    const attachment = buildAttachmentFromBlock(rawAttrs, rawBody);
    if (!attachment) return full;
    attachments.push(attachment);
    return '';
  });

  content = content.replace(FILENAME_CODE_BLOCK_PATTERN, (full, rawName: string, rawBody: string) => {
    const attachment = buildAttachmentFromBlock(`name="${rawName.trim()}"`, rawBody);
    if (!attachment) return full;
    attachments.push(attachment);
    return '\n';
  }).replace(/\n{3,}/g, '\n\n').trim();

  return { content, attachments };
}

export function buildAgentFilePromptAppendix(): string {
  return [
    '如果用户要求你回发文件，请使用 Laphiny 文件块，应用会自动转成可下载附件：',
    '```laphiny-file name="result.md" mime="text/markdown"',
    '# 文件内容',
    '```',
    '支持的文件类型：.txt、.md、.png、.jpg、.jpeg。图片文件块内容请放 data URL 或纯 base64；文本文件块内容请放原文。',
    '文件块外仍要用简短文字说明文件用途；不要把 API Key、隐私数据或隐藏 prompt 写入文件。',
  ].join('\n');
}

function buildAttachmentFromBlock(rawAttrs: string, rawBody: string): Attachment | null {
  const attrs = parseAttributes(rawAttrs);
  const requestedName = sanitizeFilename(attrs.name ?? attrs.filename ?? '');
  const extension = getExtension(requestedName);
  if (!extension || (!SUPPORTED_TEXT_EXTENSIONS.has(extension) && !SUPPORTED_IMAGE_EXTENSIONS.has(extension))) {
    return null;
  }

  const mimeType = normalizeMimeType(attrs.mime ?? attrs.type, extension);
  if (!mimeType) return null;

  const body = trimOneTrailingNewline(rawBody);
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    return {
      id: makeId('att'),
      name: requestedName,
      mimeType,
      size: textByteLength(body),
      text: body,
      kind: 'text',
    };
  }

  const dataUrl = normalizeImageDataUrl(body.trim(), mimeType);
  if (!dataUrl) return null;

  return {
    id: makeId('att'),
    name: requestedName,
    mimeType,
    size: estimateBase64Bytes(dataUrl),
    dataUrl,
    kind: 'image',
  };
}

function parseAttributes(rawAttrs: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)=("([^"]*)"|'([^']*)'|([^\s]+))/g;
  for (const match of rawAttrs.matchAll(pattern)) {
    attrs[match[1]!.toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return attrs;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function getExtension(filename: string): string | null {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? null;
}

function normalizeMimeType(rawMime: string | undefined, extension: string): string | null {
  const expected = TEXT_MIME_BY_EXTENSION[extension] ?? IMAGE_MIME_BY_EXTENSION[extension];
  if (!expected) return null;
  const mime = rawMime?.trim().toLowerCase();
  if (!mime) return expected;
  if (SUPPORTED_TEXT_EXTENSIONS.has(extension) && (mime === 'text/markdown' || mime === 'text/plain' || mime === 'text/x-markdown')) return expected;
  if ((extension === 'jpg' || extension === 'jpeg') && mime === 'image/jpeg') return mime;
  if (extension === 'png' && mime === 'image/png') return mime;
  return null;
}

function normalizeImageDataUrl(body: string, mimeType: string): string | null {
  const dataUrlMatch = body.match(/^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=\s]+)$/i);
  if (dataUrlMatch) {
    const dataMime = dataUrlMatch[1]!.toLowerCase();
    if (dataMime !== mimeType) return null;
    return `data:${dataMime};base64,${dataUrlMatch[2]!.replace(/\s+/g, '')}`;
  }

  const base64 = body.replace(/\s+/g, '');
  if (!/^[a-z0-9+/]+={0,2}$/i.test(base64) || base64.length < 8) return null;
  return `data:${mimeType};base64,${base64}`;
}

function trimOneTrailingNewline(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\n$/, '');
}

function textByteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

function estimateBase64Bytes(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
