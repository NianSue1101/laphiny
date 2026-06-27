import type { ComponentProps } from 'react';
import ExpoIonicons from '@expo/vector-icons/Ionicons';

import type { IconName } from '../app/app_types';

type ExpoIoniconName = ComponentProps<typeof ExpoIonicons>['name'];

const ICON_ALIASES: Record<string, ExpoIoniconName> = {
  albums: 'albums',
  close: 'close',
  flash: 'flash',
  options: 'options',
  send: 'send',
};

function normalizeIconName(name: IconName): ExpoIoniconName {
  return ICON_ALIASES[name] ?? (name as ExpoIoniconName);
}

export function Ionicons({ name, size = 16, color = '#4b5563' }: { name: IconName; size?: number; color?: string }) {
  return <ExpoIonicons name={normalizeIconName(name)} size={size} color={color} />;
}
