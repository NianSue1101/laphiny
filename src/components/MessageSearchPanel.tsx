import type { ComponentType } from 'react';
import { TouchableOpacity, View, type TextInputProps, type TextProps } from 'react-native';

import type { MessageSearchResult } from '../app/app_types';
import { formatDateTime } from '../app/app_utils';
import { Ionicons } from './SafeIcon';

interface MessageSearchPanelProps {
  query: string;
  results: MessageSearchResult[];
  selectedRoomId: string | null;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  TextInputComponent: ComponentType<TextInputProps>;
  onChangeQuery: (query: string) => void;
  onOpenRoom: (roomId: string) => void;
}

export function MessageSearchPanel({
  query,
  results,
  selectedRoomId,
  styles,
  TextComponent: Text,
  TextInputComponent: TextInput,
  onChangeQuery,
  onOpenRoom,
}: MessageSearchPanelProps) {
  const normalizedQuery = query.trim();

  return (
    <View style={styles.searchPanel}>
      <View style={styles.searchInputRow}>
        <Ionicons name="search-outline" size={16} color="#6b7280" />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={onChangeQuery}
          placeholder="搜索全部房间消息、作者或附件名"
          placeholderTextColor="#9ca3af"
        />
        {normalizedQuery ? (
          <TouchableOpacity onPress={() => onChangeQuery('')}>
            <Ionicons name="close-circle" size={16} color="#9ca3af" />
          </TouchableOpacity>
        ) : null}
      </View>
      {normalizedQuery ? (
        <View style={styles.searchResults}>
          <Text style={styles.help}>找到 {results.length} 条匹配，最多显示前 8 条。</Text>
          {results.slice(0, 8).map((result) => (
            <TouchableOpacity
              key={`${result.room.id}-${result.message.id}`}
              style={[styles.searchResult, result.room.id === selectedRoomId && styles.searchResultActive]}
              onPress={() => onOpenRoom(result.room.id)}
            >
              <View style={styles.searchResultHeader}>
                <Text style={styles.searchResultTitle}>{result.room.name}</Text>
                <Text style={styles.searchResultMeta}>{result.message.authorName} · {formatDateTime(result.message.createdAt)}</Text>
              </View>
              <Text style={styles.searchResultSnippet} numberOfLines={2}>{result.snippet}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}
