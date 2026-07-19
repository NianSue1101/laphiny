import { memo, type ComponentType } from 'react';
import { TouchableOpacity, View, type TextProps } from 'react-native';

import { formatMessageTimestamp, getStatusLabel } from '../../app/app_utils';
import { normalizeHermesReplyText } from '../../lib/hermes_client';
import { getChatNoticeAction, type ChatNoticeAction } from '../../lib/chat_notice_actions';
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
  showMessageDate: boolean;
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
  onOpenNoticeAction: (action: ChatNoticeAction) => void;
}

export const MessageBubble = memo(function MessageBubble({
  message,
  renderable,
  isDarkMode,
  isWideLayout,
  selectedFontFamily,
  showReasoning,
  showMessageDate,
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
  onOpenNoticeAction,
}: MessageBubbleProps) {
  const Text = TextComponent;
  const isAgentMessage = message.authorId !== 'user' && message.authorId !== 'system';
  const displayContent = message.authorId === 'user'
    ? renderable.content
    : normalizeHermesReplyText(renderable.content);
  const noticeAction = getChatNoticeAction(message);

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
          {message.origin === 'proactive' ? <Text style={styles.messageRoleBadge}>主动回复</Text> : null}
        </View>
        <Text style={[styles.status, message.status === 'error' && styles.statusError]}>
          {message.status === 'running' && message.streamPhase
            ? getAgentStreamPhaseLabel(message.streamPhase)
            : getStatusLabel(message.status)} · {formatMessageTimestamp(message.createdAt, showMessageDate)}
        </Text>
      </View>
      {message.error ? <Text style={styles.messageErrorDetail}>{message.error}</Text> : null}
      {message.activityNotices?.length ? (
        <View style={styles.activityNoticeList}>
          {message.activityNotices.map((notice) => (
            <View key={notice.id} style={styles.activityNotice}>
              <Ionicons
                name={notice.status === 'completed' ? 'checkmark-circle-outline' : notice.status === 'failed' ? 'alert-circle-outline' : 'sparkles-outline'}
                size={12}
                color={notice.status === 'failed' ? '#b91c1c' : '#6b7280'}
              />
              <Text style={[styles.activityNoticeText, notice.status === 'failed' && styles.activityNoticeTextError]}>
                {notice.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
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
      {noticeAction ? (
        <View style={styles.messageActions}>
          <MiniButton
            icon="options-outline"
            label={noticeAction.label}
            active
            onPress={() => onOpenNoticeAction(noticeAction)}
          />
        </View>
      ) : null}
      {isAgentMessage ? (
        <View style={styles.messageActions}>
          <MiniButton icon="copy-outline" label="复制" onPress={() => onCopyAgentReply(message)} />
          {message.status === 'running' ? (
            <MiniButton icon="stop-circle-outline" label={stopping ? '停止中' : '停止'} onPress={() => onStopMessage(message.id)} />
          ) : message.origin !== 'proactive' ? (
            <MiniButton icon="refresh-outline" label={message.status === 'interrupted' ? '恢复' : '重试'} onPress={() => onRetryMessage(message)} />
          ) : null}
        </View>
      ) : null}
      {message.authorId === 'user' && isLastEditableUserMessage && !sending ? (
        <View style={styles.messageActions}>
          <MiniButton icon="create-outline" label="编辑并回滚" onPress={onEditLastUserMessage} />
        </View>
      ) : null}
    </View>
  );
}, areMessageBubblePropsEqual);

function areMessageBubblePropsEqual(previous: MessageBubbleProps, next: MessageBubbleProps): boolean {
  // Message updates are immutable, so a streaming delta changes only the
  // active message reference. Keep the other visible Markdown trees mounted
  // instead of re-rendering the entire FlatList on every throttled flush.
  return previous.message === next.message
    && previous.isDarkMode === next.isDarkMode
    && previous.isWideLayout === next.isWideLayout
    && previous.selectedFontFamily === next.selectedFontFamily
    && previous.showReasoning === next.showReasoning
    && previous.showMessageDate === next.showMessageDate
    && previous.isLastEditableUserMessage === next.isLastEditableUserMessage
    && previous.sending === next.sending
    && previous.stopping === next.stopping
    && previous.styles === next.styles
    && previous.TextComponent === next.TextComponent
    && previous.onOpenNoticeAction === next.onOpenNoticeAction;
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
