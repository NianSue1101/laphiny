import type { ComponentType, MutableRefObject, ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  type TextProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import type { ChatMessage, Room } from '../../types';
import { shouldAutoLoadOlderMessages } from '../../lib/message_search';
import { EmptyState } from '../Primitives';

type Styles = Record<string, any>;

interface ChatMessagesListProps {
  messageScrollRef: MutableRefObject<FlatList<ChatMessage> | null>;
  room?: Room | null;
  messages: ChatMessage[];
  normalizedSearchQuery: string;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  historyError?: string | null;
  renderMessageBubble: (message: ChatMessage) => ReactElement;
  onContentSizeChange: () => void;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onOpenRoomsTab: () => void;
  onLoadOlderMessages: () => void;
  onRetryHistory: () => void;
}

export function ChatMessagesList({
  messageScrollRef,
  room,
  messages,
  normalizedSearchQuery,
  styles,
  TextComponent: Text,
  hasOlderMessages,
  loadingOlderMessages,
  historyError,
  renderMessageBubble,
  onContentSizeChange,
  onScroll,
  onOpenRoomsTab,
  onLoadOlderMessages,
  onRetryHistory,
}: ChatMessagesListProps) {
  return (
    <FlatList
      // Native FlatList retains its offset when only data changes. A room id
      // key resets that offset before the post-layout scroll-to-end runs.
      key={room?.id ?? 'no-room'}
      ref={messageScrollRef}
      data={room ? messages : []}
      keyExtractor={(message) => message.id}
      style={styles.messages}
      contentContainerStyle={styles.messagesContent}
      onLayout={onContentSizeChange}
      onContentSizeChange={onContentSizeChange}
      onScroll={(event) => {
        onScroll(event);
        if (shouldAutoLoadOlderMessages({
          offsetY: event.nativeEvent.contentOffset.y,
          hasOlderMessages,
          loading: loadingOlderMessages,
          searching: Boolean(normalizedSearchQuery || historyError),
        })) {
          onLoadOlderMessages();
        }
      }}
      scrollEventThrottle={80}
      initialNumToRender={18}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
      ListHeaderComponent={room && !normalizedSearchQuery && (hasOlderMessages || historyError) ? (
        <TouchableOpacity
          style={styles.historyLoader}
          onPress={historyError ? onRetryHistory : onLoadOlderMessages}
          disabled={loadingOlderMessages}
        >
          {loadingOlderMessages ? <ActivityIndicator size="small" color="#6d28d9" /> : null}
          <Text style={styles.historyLoaderText}>
            {loadingOlderMessages
              ? '正在加载更早消息…'
              : historyError
                ? `历史读取失败，点此重试：${historyError}`
                : '加载更早消息（接近顶部也会自动加载）'}
          </Text>
        </TouchableOpacity>
      ) : null}
      ListEmptyComponent={(
        !room ? (
          <EmptyState
            icon="albums-outline"
            title="还没有可聊天的房间"
            body="先在房间页创建单聊或群聊，再回到这里开始对话。"
            actionLabel="去创建"
            onAction={onOpenRoomsTab}
          />
        ) : normalizedSearchQuery ? (
          <EmptyState
            icon="search-outline"
            title="当前房间没有匹配消息"
            body="搜索会跨全部房间进行；可以点击上方结果跳转到其他房间。"
          />
        ) : (
          <EmptyState
            icon="sparkles-outline"
            title="新的对话已经就绪"
            body={room.kind === 'group'
              ? '点成员标签选择回复对象；也可以输入 @成员名、@all/@all-seq、/council 等协作仪式，或在 RP 模式下输入 /rp /scene /ooc。'
              : '输入消息后发送，Laphiny 会保留最近上下文。'}
          />
        )
      )}
      renderItem={({ item }) => renderMessageBubble(item)}
    />
  );
}
