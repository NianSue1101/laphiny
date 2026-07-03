import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

import { getErrorMessage, showNotice } from '../app/app_utils';
import { normalizeHermesReplyText } from '../lib/hermes_client';
import type { AppPreferences, Attachment, ChatMessage } from '../types';

type SavedFile = {
  uri: string;
  userVisible: boolean;
  locationLabel: string;
};

type UseDownloadRuntimeOptions = {
  appPreferences: AppPreferences;
  updateAppPreferences: (patch: Partial<AppPreferences>) => void;
  copyText: (text: string) => Promise<unknown>;
};

export function useDownloadRuntime({ appPreferences, updateAppPreferences, copyText }: UseDownloadRuntimeOptions) {
  async function copyAgentReply(message: ChatMessage) {
    const text = normalizeHermesReplyText(message.content).trim();
    if (!text) {
      showNotice('暂无可复制内容', '这条回复还没有文本内容。');
      return;
    }

    await copyText(text);
    showNotice('回复已复制', `${message.authorName} 的回复已复制到剪贴板。`);
  }

  async function downloadAttachment(attachment: Attachment) {
    try {
      const saved = await saveAttachmentToDownloads(attachment);
      if (!saved) {
        showNotice('附件暂不可下载', '目前支持下载 AI 回发的 txt、md、png、jpg 文件。');
        return;
      }
      showNotice(
        saved.userVisible ? '附件已保存' : '附件已保存到应用目录',
        saved.userVisible
          ? `${attachment.name} 已保存到 ${saved.locationLabel}。`
          : `系统未授予下载目录权限，已保存到应用私有目录：${saved.uri}`,
      );
    } catch (error) {
      showNotice('附件保存失败', getErrorMessage(error));
    }
  }

  async function saveTextFile(filename: string, text: string, mimeType: string): Promise<SavedFile | null> {
    try {
      return await saveDownloadFile({
        filename,
        mimeType,
        data: text,
        encoding: FileSystem.EncodingType.UTF8,
      });
    } catch (error) {
      console.warn('Text file export failed.', error);
      return null;
    }
  }

  async function saveAttachmentToDownloads(attachment: Attachment): Promise<SavedFile | null> {
    const filename = sanitizeDownloadFilename(attachment.name);
    if (!filename) return null;

    if (attachment.kind === 'text' && typeof attachment.text === 'string') {
      return saveDownloadFile({
        filename,
        mimeType: attachment.mimeType || 'text/plain',
        data: attachment.text,
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    if (attachment.kind === 'image' && attachment.dataUrl) {
      const base64 = getBase64FromDataUrl(attachment.dataUrl);
      if (!base64) return null;
      return saveDownloadFile({
        filename,
        mimeType: attachment.mimeType || 'image/png',
        data: base64,
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    return null;
  }

  async function saveDownloadFile({
    filename,
    mimeType,
    data,
    encoding,
  }: {
    filename: string;
    mimeType: string;
    data: string;
    encoding: FileSystem.EncodingType;
  }): Promise<SavedFile> {
    if (Platform.OS === 'web') {
      const href = encoding === FileSystem.EncodingType.Base64
        ? `data:${mimeType};base64,${data}`
        : URL.createObjectURL(new Blob([data], { type: mimeType }));
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      if (encoding !== FileSystem.EncodingType.Base64) {
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
      return { uri: filename, userVisible: true, locationLabel: '浏览器默认下载目录' };
    }

    if (Platform.OS === 'android') {
      const storage = FileSystem.StorageAccessFramework;
      const mime = normalizeDownloadMimeType(filename, mimeType);
      const writeToDirectory = async (directoryUri: string, locationLabel: string) => {
        const fileUri = await storage.createFileAsync(directoryUri, filename, mime);
        await storage.writeAsStringAsync(fileUri, data, { encoding });
        return { uri: fileUri, userVisible: true, locationLabel };
      };

      if (appPreferences.downloadDirectoryUri) {
        try {
          return await writeToDirectory(appPreferences.downloadDirectoryUri, appPreferences.downloadDirectoryLabel ?? '已选择下载目录');
        } catch (error) {
          console.warn('Saved Android download directory is no longer writable; requesting a fresh directory.', error);
          updateAppPreferences({ downloadDirectoryUri: undefined, downloadDirectoryLabel: undefined });
        }
      }

      try {
        const initialUri = storage.getUriForDirectoryInRoot('Download');
        const permission = await storage.requestDirectoryPermissionsAsync(initialUri);
        if (permission.granted) {
          updateAppPreferences({ downloadDirectoryUri: permission.directoryUri, downloadDirectoryLabel: '已选择下载目录' });
          return await writeToDirectory(permission.directoryUri, '已选择下载目录');
        }
      } catch (error) {
        console.warn('Android download via Storage Access Framework failed; falling back to app-private storage.', error);
      }
    }

    const directory = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
    if (!directory) throw new Error('当前设备没有可写入的文件目录');
    const laphinyDir = `${directory}Laphiny/`;
    const info = await FileSystem.getInfoAsync(laphinyDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(laphinyDir, { intermediates: true });
    }
    const fileUri = `${laphinyDir}${filename}`;
    await FileSystem.writeAsStringAsync(fileUri, data, { encoding });
    return { uri: fileUri, userVisible: false, locationLabel: '应用私有目录/Laphiny' };
  }

  return {
    copyAgentReply,
    downloadAttachment,
    saveTextFile,
  };
}

function sanitizeDownloadFilename(filename: string): string {
  return filename
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function normalizeDownloadMimeType(filename: string, mimeType: string): string {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === 'txt') return 'text/plain';
  if (extension === 'md') return 'text/markdown';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  return mimeType || 'application/octet-stream';
}

function getBase64FromDataUrl(dataUrl: string): string | null {
  const match = dataUrl.match(/^data:image\/(?:png|jpeg);base64,([a-z0-9+/=]+)$/i);
  return match?.[1] ?? null;
}
