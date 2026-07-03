import type { ComponentType } from 'react';
import { ScrollView, View, type TextProps } from 'react-native';

import type { IconName, Tab } from '../app/app_types';
import { Ionicons } from './SafeIcon';
import { TabButton } from './Primitives';

type Styles = Record<string, any>;

const TABS: Array<{ id: Tab; icon: IconName; label: string }> = [
  { id: 'chat', icon: 'chatbubble-ellipses-outline', label: '聊天' },
  { id: 'square', icon: 'planet-outline', label: '灵庭' },
  { id: 'rooms', icon: 'albums-outline', label: '房间' },
  { id: 'connections', icon: 'git-network-outline', label: '连接' },
  { id: 'settings', icon: 'settings-outline', label: '设置' },
];

interface AppShellHeaderProps {
  activeTab: Tab;
  roomsCount: number;
  enabledConnectionsCount: number;
  totalUnread: number;
  isDarkMode: boolean;
  styles: Styles;
  TextComponent: ComponentType<TextProps>;
  onChangeTab: (tab: Tab) => void;
}

export function AppShellHeader({
  activeTab,
  roomsCount,
  enabledConnectionsCount,
  totalUnread,
  isDarkMode,
  styles,
  TextComponent,
  onChangeTab,
}: AppShellHeaderProps) {
  const Text = TextComponent;

  return (
    <>
      <View style={[styles.header, isDarkMode && styles.headerDark]}>
        <View style={styles.brandBlock}>
          <Text style={[styles.title, isDarkMode && styles.titleDark]}>Laphiny</Text>
          <Text style={[styles.subtitle, isDarkMode && styles.subtitleDark]}>多 Hermes 协作聊天</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.statPill}>
            <Ionicons name="chatbubbles-outline" size={14} color="#1f2937" />
            <Text style={styles.statText}>{roomsCount} 房间</Text>
          </View>
          <View style={[styles.statPill, styles.statPillAccent]}>
            <Ionicons name="radio-outline" size={14} color="#065f46" />
            <Text style={[styles.statText, styles.statTextAccent]}>{enabledConnectionsCount} 可用</Text>
          </View>
          {totalUnread > 0 ? (
            <View style={styles.unreadPill}>
              <Ionicons name="notifications" size={14} color="#991b1b" />
              <Text style={styles.unreadPillText}>{totalUnread} 未读</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabs}>
        {TABS.map((item) => (
          <TabButton
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeTab === item.id}
            onPress={() => onChangeTab(item.id)}
          />
        ))}
      </ScrollView>
    </>
  );
}
