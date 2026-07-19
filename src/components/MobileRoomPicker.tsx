import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextProps } from 'react-native';

import { DEFAULT_CONTEXT_LIMIT } from '../config/app_config';
import type { ChatMessage, Room } from '../types';
import { getStatusLabel } from '../app/app_utils';
import type { RoomStreamSummary } from '../lib/stream_events';
import { EmptyState, MiniButton, SecondaryButton } from './Primitives';
import { Ionicons } from './SafeIcon';

interface MobileRoomPickerProps {
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  unreadByRoom: Record<string, number>;
  roomStreamSummaries: Record<string, RoomStreamSummary>;
  isDarkMode: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onCreateRoom: () => void;
  onOpenRoom: (roomId: string) => void;
  onManageRoom: (roomId: string) => void;
}

export function MobileRoomPicker({
  rooms,
  messagesByRoom,
  unreadByRoom,
  roomStreamSummaries,
  isDarkMode,
  styles,
  TextComponent: Text,
  onCreateRoom,
  onOpenRoom,
  onManageRoom,
}: MobileRoomPickerProps) {
  return (
    <ScrollView style={styles.mobileRoomPicker} contentContainerStyle={styles.mobileRoomPickerContent}>
      <View style={styles.mobileRoomPickerHeader}>
        <View style={styles.mobileRoomPickerHeaderCopy}>
          <Text style={[styles.sectionTitle, isDarkMode && styles.titleDark]}>选择房间</Text>
          <Text style={[styles.help, isDarkMode && styles.subtitleDark]}>点卡片或“进入”开始聊天；点“管理”会回到房间页原地管理，不再跳进聊天旧详情。</Text>
        </View>
        <View style={styles.mobileRoomPickerHeaderAction}>
          <SecondaryButton icon="add-circle-outline" label="新房间" onPress={onCreateRoom} />
        </View>
      </View>
      {rooms.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title="还没有房间"
          body="先创建单聊或群聊，再回到这里进入专注聊天。"
          actionLabel="去创建"
          onAction={onCreateRoom}
        />
      ) : null}
      {rooms.map((room) => {
        const roomMessages = messagesByRoom[room.id] ?? [];
        const lastMessage = roomMessages[roomMessages.length - 1];
        const unread = unreadByRoom[room.id] ?? 0;
        const streamSummary = roomStreamSummaries[room.id];
        return (
          <View key={room.id} style={[styles.mobileRoomCard, isDarkMode && styles.mobileRoomCardDark]}>
            <TouchableOpacity activeOpacity={0.88} onPress={() => onOpenRoom(room.id)}>
              <View style={styles.mobileRoomCardTop}>
                <View style={styles.squareEventSource}>
                  <Ionicons name={room.kind === 'group' ? 'people-outline' : 'person-outline'} size={17} color="#2563eb" />
                  <Text style={styles.cardTitle} numberOfLines={1}>{room.name}</Text>
                </View>
                {unread > 0 ? <Text style={styles.sidebarUnreadBadge}>{unread}</Text> : null}
              </View>
              <Text style={styles.sidebarRoomPreview} numberOfLines={2}>
                {streamSummary
                  ? `${streamSummary.activeCount} 个 Agent 正在${streamSummary.label.replace(/中$/u, '')}`
                  : lastMessage ? `${lastMessage.authorName}: ${lastMessage.content || getStatusLabel(lastMessage.status)}` : '新的房间'}
              </Text>
            </TouchableOpacity>
            <View style={styles.mobileRoomCardFooter}>
              <Text style={[styles.help, styles.mobileRoomCardMeta]}>{room.kind === 'group' ? '群聊' : '单聊'} · {room.members.length} 位 Hermes · 上下文 {room.contextLimit ?? DEFAULT_CONTEXT_LIMIT}</Text>
              <View style={[styles.buttonRowCompact, styles.mobileRoomCardActions]}>
                <MiniButton icon="options-outline" label="管理" onPress={() => onManageRoom(room.id)} />
                <MiniButton icon="chatbubble-ellipses-outline" label="进入" onPress={() => onOpenRoom(room.id)} />
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
