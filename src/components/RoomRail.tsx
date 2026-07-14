import type { ComponentType } from 'react';
import { ScrollView, TouchableOpacity, View, type TextProps } from 'react-native';

import type { Room } from '../types';
import type { RoomStreamSummary } from '../lib/stream_events';
import { Ionicons } from './SafeIcon';

interface RoomRailProps {
  rooms: Room[];
  selectedRoomId: string | null;
  unreadByRoom: Record<string, number>;
  roomStreamSummaries: Record<string, RoomStreamSummary>;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onOpenRoom: (roomId: string) => void;
  onCreateRoom: () => void;
}

export function RoomRail({
  rooms,
  selectedRoomId,
  unreadByRoom,
  roomStreamSummaries,
  styles,
  TextComponent: Text,
  onOpenRoom,
  onCreateRoom,
}: RoomRailProps) {
  return (
    <View style={styles.roomRail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roomRailContent}>
        {rooms.map((room) => {
          const active = room.id === selectedRoomId;
          const streamSummary = roomStreamSummaries[room.id];
          return (
            <TouchableOpacity
              key={room.id}
              style={[styles.roomPill, active && styles.roomPillActive]}
              onPress={() => onOpenRoom(room.id)}
            >
              <Ionicons
                name={room.kind === 'group' ? 'people-outline' : 'person-outline'}
                size={14}
                color={active ? '#ffffff' : '#4b5563'}
              />
              <Text style={[styles.roomPillText, active && styles.roomPillTextActive]}>{room.name}</Text>
              {streamSummary ? (
                <Ionicons name="pulse-outline" size={13} color={active ? '#ffffff' : '#7c3aed'} />
              ) : null}
              {unreadByRoom[room.id] ? <Text style={styles.roomUnreadBadge}>{unreadByRoom[room.id]}</Text> : null}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.roomCreatePill} onPress={onCreateRoom}>
          <Ionicons name="add" size={16} color="#2563eb" />
          <Text style={styles.roomCreateText}>新房间</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
