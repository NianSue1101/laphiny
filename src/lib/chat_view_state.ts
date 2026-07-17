import type { Tab } from '../app/app_types';

export type ChatViewState = {
  key: string;
  listVisible: boolean;
};

export function resolveChatViewState({
  tab,
  selectedRoomId,
  mobileFocusedRoomId,
  width,
}: {
  tab: Tab;
  selectedRoomId: string | null;
  mobileFocusedRoomId: string | null;
  width: number;
}): ChatViewState {
  const layout = width >= 900
    ? 'wide'
    : mobileFocusedRoomId === selectedRoomId
      ? 'focused'
      : 'picker';

  return {
    key: `${tab}:${selectedRoomId ?? 'none'}:${layout}`,
    listVisible: tab === 'chat'
      && Boolean(selectedRoomId)
      && (layout === 'wide' || layout === 'focused'),
  };
}
