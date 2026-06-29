import type { ComponentType } from 'react';
import { Image, Modal, ScrollView, View, type TextProps } from 'react-native';

import type { Attachment } from '../types';
import { formatBytes } from '../app/app_utils';
import { IconButton } from './Primitives';
import { Ionicons } from './SafeIcon';

interface AttachmentPreviewModalProps {
  attachment: Attachment | null;
  compact: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onDownload: (attachment: Attachment) => void;
  onClose: () => void;
}

export function AttachmentPreviewModal({
  attachment,
  compact,
  styles,
  TextComponent: Text,
  onDownload,
  onClose,
}: AttachmentPreviewModalProps) {
  if (!attachment) return null;

  const isImage = attachment.kind === 'image' && Boolean(attachment.dataUrl || attachment.uri);
  const textPreview = attachment.kind === 'text' && attachment.text
    ? attachment.text
    : attachment.kind === 'file'
      ? '这个附件类型暂不支持内联预览，但可以查看文件信息并下载保存。'
      : '';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.attachmentModalOverlay}>
        <View style={[styles.attachmentModalCard, compact && styles.attachmentModalCardCompact]}>
          <View style={styles.attachmentModalHeader}>
            <View style={styles.attachmentModalTitleBlock}>
              <Text style={styles.attachmentModalTitle} numberOfLines={1}>{attachment.name}</Text>
              <Text style={styles.attachmentModalMeta} numberOfLines={1}>
                {attachment.mimeType || 'unknown'}{attachment.size != null ? ` · ${formatBytes(attachment.size)}` : ''}
              </Text>
            </View>
            <View style={styles.attachmentModalActions}>
              <IconButton icon="download-outline" label="下载附件" onPress={() => onDownload(attachment)} variant="primary" />
              <IconButton icon="close-outline" label="关闭预览" onPress={onClose} />
            </View>
          </View>
          <ScrollView style={styles.attachmentModalBody} contentContainerStyle={styles.attachmentModalBodyContent}>
            {isImage ? (
              <Image source={{ uri: attachment.dataUrl ?? attachment.uri ?? '' }} style={styles.attachmentPreviewImage} resizeMode="contain" />
            ) : textPreview ? (
              <Text style={styles.attachmentPreviewText}>{textPreview}</Text>
            ) : (
              <View style={styles.attachmentUnsupportedPreview}>
                <Ionicons name="document-outline" size={34} color="#2563eb" />
                <Text style={styles.attachmentUnsupportedTitle}>暂不支持预览此附件</Text>
                <Text style={styles.help}>可以使用右上角下载按钮保存文件。</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
