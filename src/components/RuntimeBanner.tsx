import type { ComponentType } from 'react';
import { Platform, View, type TextProps } from 'react-native';

import type { ServiceWorkerStatus } from '../app/app_types';
import { SecondaryButton } from './Primitives';

interface RuntimeBannerProps {
  networkOnline: boolean;
  serviceWorkerStatus: ServiceWorkerStatus;
  canInstallPwa: boolean;
  styles: Record<string, any>;
  TextComponent: ComponentType<TextProps>;
  onInstallPwa: () => void;
}

export function RuntimeBanner({
  networkOnline,
  serviceWorkerStatus,
  canInstallPwa,
  styles,
  TextComponent: Text,
  onInstallPwa,
}: RuntimeBannerProps) {
  if (Platform.OS !== 'web') return null;
  const shouldShow = !networkOnline || canInstallPwa || serviceWorkerStatus === 'failed' || serviceWorkerStatus === 'registering';
  if (!shouldShow) return null;

  return (
    <View style={[styles.runtimeBanner, !networkOnline && styles.runtimeBannerOffline]}>
      <View style={styles.runtimeBannerTextBlock}>
        <Text style={styles.runtimeBannerTitle}>
          {!networkOnline ? '当前离线' : serviceWorkerStatus === 'registering' ? '正在准备离线缓存' : serviceWorkerStatus === 'failed' ? '离线缓存不可用' : '可以安装为应用'}
        </Text>
        <Text style={styles.runtimeBannerBody}>
          {!networkOnline
            ? '你仍可查看本地记录；Hermes 请求和同步会在网络恢复后再使用。'
            : serviceWorkerStatus === 'registering'
              ? '首次打开会注册 Service Worker，之后已访问资源可在弱网或离线时继续打开。'
              : serviceWorkerStatus === 'failed'
                ? '浏览器没有成功注册 Service Worker；Web 仍可使用，但离线能力会受限。'
                : '浏览器已提供安装入口，安装后可像独立应用一样打开 Laphiny。'}
        </Text>
      </View>
      {canInstallPwa ? <SecondaryButton icon="download-outline" label="安装" onPress={onInstallPwa} /> : null}
    </View>
  );
}
