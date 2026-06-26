import { Text } from 'react-native';
import type { IconName } from '../app/app_types';

const SAFE_ICON_LABELS: Record<string, string> = {
  add: '+',
  'apps-outline': 'M',
  'chatbubbles-outline': 'C',
  close: 'x',
  'close-circle': 'x',
  'game-controller-outline': 'RP',
  'git-branch-outline': 'B',
  'git-network-outline': 'N',
  notifications: '!',
  'radio-outline': 'ON',
  'search-outline': 'S',
  'people-outline': 'P',
  'person-outline': 'U',
  'sparkles-outline': '*',
  'file-tray-full-outline': 'F',
  'people-circle-outline': 'P',
  'warning-outline': '!',
  'checkmark-done-outline': 'OK',
  'repeat-outline': 'R',
  'stop-circle-outline': 'STOP',
  'map-outline': 'MAP',
  'chatbox-ellipses-outline': 'OOC',
  'document-text-outline': 'TXT',
  'document-outline': 'DOC',
  'rocket-outline': 'GO',
  'newspaper-outline': 'NEWS',
  'stats-chart-outline': 'STAT',
  'reader-outline': 'SUM',
  'shield-checkmark-outline': 'SAFE',
  'cloud-upload-outline': 'UP',
  'cloud-download-outline': 'DOWN',
  'sync-outline': 'SYNC',
  'bug-outline': 'BUG',
  'pulse-outline': 'LOG',
  'server-outline': 'SRV',
  'time-outline': 'TIME',
  'clipboard-outline': 'COPY',
  'download-outline': 'DL',
  'trash-outline': 'DEL',
  'create-outline': 'EDIT',
};

function getSafeIconLabel(name: string): string {
  if (SAFE_ICON_LABELS[name]) return SAFE_ICON_LABELS[name];
  if (name.includes('warning')) return '!';
  if (name.includes('check')) return 'OK';
  if (name.includes('game')) return 'RP';
  if (name.includes('people') || name.includes('person')) return 'P';
  if (name.includes('search')) return 'S';
  if (name.includes('close') || name.includes('stop')) return 'x';
  if (name.includes('document') || name.includes('file')) return 'DOC';
  if (name.includes('sync')) return 'SYNC';
  return name
    .split('-')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

export function Ionicons({ name, size = 16, color = '#4b5563' }: { name: IconName; size?: number; color?: string }) {
  const label = getSafeIconLabel(name);
  const boxSize = Math.max(16, size + 4);
  return (
    <Text
      accessibilityLabel={name}
      style={{
        minWidth: boxSize,
        height: boxSize,
        lineHeight: boxSize,
        borderRadius: Math.round(boxSize / 2),
        textAlign: 'center',
        color,
        borderColor: color,
        borderWidth: 1,
        fontSize: label.length > 2 ? 8 : 10,
        fontWeight: '800',
        overflow: 'hidden',
      }}
    >
      {label}
    </Text>
  );
}
