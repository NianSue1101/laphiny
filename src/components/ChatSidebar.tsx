import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextProps } from 'react-native';

import type { ChatMessage, Room } from '../types';
import { getStatusLabel } from '../app/app_utils';
import type { RoomStreamSummary } from '../lib/stream_events';
import { Ionicons } from './SafeIcon';

interface ChatSidebarProps {
  rooms: Room[];
  selectedRoomId: string | null;
  messagesByRoom: Record<string, ChatMessage[]>;
  unreadByRoom: Record<string, number>;
  roomStreamSummaries: Record<string, RoomStreamSummary>;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onOpenRoom: (roomId: string) => void;
  onCreateRoom: () => void;
}

export function ChatSidebar({
  rooms,
  selectedRoomId,
  messagesByRoom,
  unreadByRoom,
  roomStreamSummaries,
  styles,
  TextComponent: Text,
  onOpenRoom,
  onCreateRoom,
}: ChatSidebarProps) {
  return (
    <View style={styles.chatSidebar}>
      <View style={styles.sidebarHeader}>
        <Text style={styles.sidebarTitle}>房间</Text>
        <TouchableOpacity style={styles.sidebarIconButton} onPress={onCreateRoom}>
          <Ionicons name="add" size={18} color="#2563eb" />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.sidebarRooms} contentContainerStyle={styles.sidebarRoomsContent}>
        {rooms.length === 0 ? <Text style={styles.help}>还没有房间。</Text> : null}
        {rooms.map((room) => {
          const roomMessages = messagesByRoom[room.id] ?? [];
          const lastMessage = roomMessages[roomMessages.length - 1];
          const active = room.id === selectedRoomId;
          const unread = unreadByRoom[room.id] ?? 0;
          const streamSummary = roomStreamSummaries[room.id];
          return (
            <TouchableOpacity
              key={room.id}
              style={[styles.sidebarRoom, active && styles.sidebarRoomActive]}
              onPress={() => onOpenRoom(room.id)}
            >
              <View style={styles.sidebarRoomTop}>
                <Text style={[styles.sidebarRoomTitle, active && styles.sidebarRoomTitleActive]}>{room.name}</Text>
                {unread > 0 ? <Text style={styles.sidebarUnreadBadge}>{unread}</Text> : <Text style={styles.sidebarRoomMeta}>{room.members.length}</Text>}
              </View>
              <Text style={styles.sidebarRoomPreview} numberOfLines={2}>
                {streamSummary
                  ? `${streamSummary.activeCount} 个 Agent · ${streamSummary.label}`
                  : lastMessage ? `${lastMessage.authorName}: ${lastMessage.content || getStatusLabel(lastMessage.status)}` : '新的房间'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}
