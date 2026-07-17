import { useEffect, useRef, useState, type ComponentType, type MutableRefObject, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  View,
  type TextProps,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ViewToken,
} from 'react-native';

import type { ChatMessage, Room } from '../../types';
import { shouldAutoLoadOlderMessages, shouldShowJumpToLatest } from '../../lib/message_search';
import { EmptyState } from '../Primitives';
import { Ionicons } from '../SafeIcon';

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
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messageCountRef = useRef(messages.length);
  const lastVisibleIndexRef = useRef(-1);
  const searchActiveRef = useRef(Boolean(normalizedSearchQuery));
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;
  messageCountRef.current = messages.length;
  searchActiveRef.current = Boolean(normalizedSearchQuery);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
    const lastVisibleIndex = viewableItems.reduce(
      (latest, item) => Math.max(latest, item.index ?? -1),
      -1,
    );
    lastVisibleIndexRef.current = lastVisibleIndex;
    setShowJumpToLatest(!searchActiveRef.current && shouldShowJumpToLatest({
      messageCount: messageCountRef.current,
      lastVisibleIndex,
    }));
  }).current;

  useEffect(() => {
    setShowJumpToLatest(!normalizedSearchQuery && shouldShowJumpToLatest({
      messageCount: messages.length,
      lastVisibleIndex: lastVisibleIndexRef.current,
    }));
  }, [messages.length, normalizedSearchQuery, room?.id]);

  return (
    <View style={styles.messagesFrame}>
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
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
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
      {showJumpToLatest ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="回到最新消息"
          style={styles.jumpToLatestButton}
          onPress={() => {
            setShowJumpToLatest(false);
            messageScrollRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <Ionicons name="arrow-down-outline" size={15} color="#9f4969" />
          <Text style={styles.jumpToLatestText}>最新</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
