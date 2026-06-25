import { Attachment, ChatContentPart, HermesChatMessage } from '../types';

const MAX_TEXT_ATTACHMENT_CHARS = 32_000;

export function isImageAttachment(attachment: Pick<Attachment, 'kind' | 'mimeType' | 'dataUrl'>): boolean {
  return attachment.kind === 'image' && Boolean(attachment.dataUrl) && attachment.mimeType.startsWith('image/');
}

export function buildAttachmentContext(attachments: Attachment[] = []): string {
  const blocks: string[] = [];

  for (const attachment of attachments) {
    if (attachment.kind === 'text' && attachment.text?.trim()) {
      const clipped = attachment.text.slice(0, MAX_TEXT_ATTACHMENT_CHARS);
      blocks.push([
        `<attachment name="${escapeAttachmentAttribute(attachment.name)}" type="${escapeAttachmentAttribute(attachment.mimeType)}">`,
        clipped,
        '</attachment>',
      ].join('\n'));
      continue;
    }

    if (attachment.kind === 'file') {
      blocks.push(
        `[Attachment: ${attachment.name} (${attachment.mimeType || 'unknown type'}) is available in Laphiny, but Hermes API Server currently accepts image data URLs and text context only.]`,
      );
    }
  }

  return blocks.join('\n\n');
}

export function buildHermesUserContent(text: string, attachments: Attachment[] = []): HermesChatMessage['content'] {
  const attachmentContext = buildAttachmentContext(attachments);
  const fullText = [text.trim(), attachmentContext].filter(Boolean).join('\n\n');
  const imageParts = attachments.filter(isImageAttachment);

  if (imageParts.length === 0) {
    return fullText;
  }

  const parts: ChatContentPart[] = [];
  if (fullText) {
    parts.push({ type: 'text', text: fullText });
  }

  for (const attachment of imageParts) {
    if (attachment.dataUrl) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: attachment.dataUrl,
          detail: 'auto',
        },
      });
    }
  }

  return parts;
}

function escapeAttachmentAttribute(value: string): string {
  return value.replace(/["&<>]/g, (char) => {
    switch (char) {
      case '"':
        return '&quot;';
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      default:
        return char;
    }
  });
}
