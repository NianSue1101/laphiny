import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';

import { Attachment } from '../types';

const TEXT_MIME_PREFIXES = ['text/', 'application/json', 'application/xml', 'application/javascript'];
const MAX_TEXT_FILE_BYTES = 512_000;

export async function pickImages(): Promise<Attachment[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    allowsMultipleSelection: true,
    base64: true,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.88,
  });

  if (result.canceled) {
    return [];
  }

  return result.assets.flatMap((asset) => {
    if (!asset.base64) return [];
    const mimeType = asset.mimeType ?? 'image/jpeg';
    return [{
      id: makeId('att'),
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      mimeType,
      size: asset.fileSize,
      uri: asset.uri,
      dataUrl: `data:${mimeType};base64,${asset.base64}`,
      kind: 'image' as const,
    }];
  });
}

export async function pickDocuments(): Promise<Attachment[]> {
  const result = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return [];
  }

  const attachments: Attachment[] = [];

  for (const asset of result.assets) {
    const mimeType = asset.mimeType ?? 'application/octet-stream';
    const isText = TEXT_MIME_PREFIXES.some((prefix) => mimeType.startsWith(prefix));
    let text: string | undefined;

    if (isText && (!asset.size || asset.size <= MAX_TEXT_FILE_BYTES)) {
      try {
        text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      } catch {
        text = undefined;
      }
    }

    attachments.push({
      id: makeId('att'),
      name: asset.name,
      mimeType,
      size: asset.size,
      uri: asset.uri,
      text,
      kind: text ? 'text' : 'file',
    });
  }

  return attachments;
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
