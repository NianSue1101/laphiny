import type { ComponentType } from 'react';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import { formatTime, getStatusLabel } from '../../app/app_utils';
import { normalizeHermesReplyText } from '../../lib/hermes_client';
import { getAgentStreamPhaseLabel, shouldDisplayServiceReasoning } from '../../lib/stream_events';
import type { AgentPermissionDecision, Attachment, ChatMessage } from '../../types';
import { MarkdownText } from '../MarkdownText';
import { AttachmentPreview, AgentAvatar, MiniButton } from '../Primitives';
import { Ionicons } from '../SafeIcon';

type Styles = Record<string, any>;

type RenderableMessageArtifacts = {
  content: string;
  attachments: Attachment[];
};

interface MessageBubbleProps {
  message: ChatMessage;
  renderable: RenderableMessageArtifacts;
  isDarkMode: boolean;
  isWideLayout: boolean;
  selectedFontFamily?: string;
  showReasoning: boolean;
  isLastEditableUserMessage: boolean;
  sending: boolean;
  stopping: boolean;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  getConnectionAvatarUri: (connectionId: string) => string | undefined;
  getMessageBubbleStyle: (message: ChatMessage) => any;
  getMessageRoleBadge: (message: ChatMessage) => string;
  onPreviewAttachment: (attachment: Attachment) => void;
  onResolvePermissionRequest: (message: ChatMessage, decision: AgentPermissionDecision) => void;
  onCopyAgentReply: (message: ChatMessage) => void;
  onStopMessage: (messageId: string) => void;
  onRetryMessage: (message: ChatMessage) => void;
  onEditLastUserMessage: () => void;
}

export function MessageBubble({
  message,
  renderable,
  isDarkMode,
  isWideLayout,
  selectedFontFamily,
  showReasoning,
  isLastEditableUserMessage,
  sending,
  stopping,
  styles,
  TextComponent,
  getConnectionAvatarUri,
  getMessageBubbleStyle,
  getMessageRoleBadge,
  onPreviewAttachment,
  onResolvePermissionRequest,
  onCopyAgentReply,
  onStopMessage,
  onRetryMessage,
  onEditLastUserMessage,
}: MessageBubbleProps) {
  const Text = TextComponent;
  const isAgentMessage = message.authorId !== 'user' && message.authorId !== 'system';
  const displayContent = message.authorId === 'user'
    ? renderable.content
    : normalizeHermesReplyText(renderable.content);

  return (
    <View
      style={[
        styles.messageBubble,
        isDarkMode && styles.messageBubbleDark,
        getMessageBubbleStyle(message),
        isWideLayout && styles.messageBubbleWide,
      ]}
    >
      {message.delegatedFrom ? (
        <View style={styles.delegationBadge}>
          <Ionicons name="git-branch-outline" size={12} color="#6b7280" />
          <Text style={styles.delegationText}>→ {message.delegatedFrom} 委托</Text>
        </View>
      ) : null}
      <View style={styles.messageMeta}>
        <View style={styles.authorBlock}>
          {isAgentMessage ? (
            <AgentAvatar alias={message.authorName} size={22} imageUri={getConnectionAvatarUri(message.authorId)} />
          ) : null}
          <Text style={styles.author}>{message.authorName}</Text>
          {isAgentMessage ? <Text style={styles.messageRoleBadge}>{getMessageRoleBadge(message)}</Text> : null}
        </View>
        <Text style={[styles.status, message.status === 'error' && styles.statusError]}>
          {message.status === 'running' && message.streamPhase
            ? getAgentStreamPhaseLabel(message.streamPhase)
            : getStatusLabel(message.status)} · {formatTime(message.createdAt)}
          {message.error ? ` · ${message.error}` : ''}
        </Text>
      </View>
      <MarkdownText content={displayContent} fontFamily={selectedFontFamily} />
      {shouldDisplayServiceReasoning(showReasoning, message.reasoning) ? (
        <View style={styles.reasoningPanel}>
          <Text style={styles.reasoningLabel}>服务端 reasoning（可选显示）</Text>
          <MarkdownText content={message.reasoning ?? ''} fontFamily={selectedFontFamily} />
        </View>
      ) : null}
      {renderable.attachments.length ? (
        <View style={styles.attachments}>
          {renderable.attachments.map((attachment) => (
            <AttachmentPreview
              key={attachment.id}
              attachment={attachment}
              actionIcon="eye-outline"
              onPress={() => onPreviewAttachment(attachment)}
            />
          ))}
        </View>
      ) : null}
      <AgentPermissionPanel
        message={message}
        styles={styles}
        TextComponent={TextComponent}
        onResolvePermissionRequest={onResolvePermissionRequest}
      />
      {isAgentMessage ? (
        <View style={styles.messageActions}>
          <MiniButton icon="copy-outline" label="复制" onPress={() => onCopyAgentReply(message)} />
          {message.status === 'running' ? (
            <MiniButton icon="stop-circle-outline" label={stopping ? '停止中' : '停止'} onPress={() => onStopMessage(message.id)} />
          ) : (
            <MiniButton icon="refresh-outline" label="重试" onPress={() => onRetryMessage(message)} />
          )}
        </View>
      ) : null}
      {message.authorId === 'user' && isLastEditableUserMessage && !sending ? (
        <View style={styles.messageActions}>
          <MiniButton icon="create-outline" label="编辑并回滚" onPress={onEditLastUserMessage} />
        </View>
      ) : null}
    </View>
  );
}

function AgentPermissionPanel({
  message,
  styles,
  TextComponent,
  onResolvePermissionRequest,
}: {
  message: ChatMessage;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  onResolvePermissionRequest: (message: ChatMessage, decision: AgentPermissionDecision) => void;
}) {
  const request = message.permissionRequest;
  if (!request) return null;

  const Text = TextComponent;
  const pending = request.status === 'pending';
  const statusText = request.status === 'pending'
    ? '等待选择'
    : request.status === 'denied'
      ? '已拒绝'
      : request.status === 'always'
        ? '已设为总是同意'
        : '已同意';

  return (
    <View style={styles.permissionPanel}>
      <View style={styles.permissionHeader}>
        <View style={styles.permissionTitleRow}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#92400e" />
          <Text style={styles.permissionTitle}>{request.title}</Text>
        </View>
        <Text style={[styles.permissionStatus, !pending && styles.permissionStatusDone]}>{statusText}</Text>
      </View>
      <Text style={styles.permissionBody}>{request.body}</Text>
      {request.reason ? <Text style={styles.permissionReason}>{request.reason}</Text> : null}
      {pending ? (
        <View style={styles.permissionActions}>
          <TouchableOpacity
            style={[styles.permissionButton, styles.permissionButtonPrimary]}
            onPress={() => onResolvePermissionRequest(message, 'allow')}
          >
            <Ionicons name="checkmark-outline" size={15} color="#ffffff" />
            <Text style={[styles.permissionButtonText, styles.permissionButtonTextPrimary]}>同意</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionButton} onPress={() => onResolvePermissionRequest(message, 'deny')}>
            <Ionicons name="close-outline" size={15} color="#374151" />
            <Text style={styles.permissionButtonText}>拒绝</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.permissionButton} onPress={() => onResolvePermissionRequest(message, 'always')}>
            <Ionicons name="infinite-outline" size={15} color="#374151" />
            <Text style={styles.permissionButtonText}>总是同意</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}
