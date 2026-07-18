import type { Tab } from '../app/app_types';

export type ChatViewState = {
  key: string;
  listVisible: boolean;
};

export type ChatScrollLifecycle = {
  generation: number;
  viewKey: string;
  visible: boolean;
};

export function advanceChatScrollLifecycle(
  current: ChatScrollLifecycle,
  next: Pick<ChatScrollLifecycle, 'viewKey' | 'visible'>,
): ChatScrollLifecycle {
  if (current.viewKey === next.viewKey && current.visible === next.visible) {
    return current;
  }
  return {
    ...next,
    generation: current.generation + 1,
  };
}

export function canExecuteChatScroll(
  scheduledGeneration: number,
  current: ChatScrollLifecycle,
): boolean {
  return current.visible && current.generation === scheduledGeneration;
}

export function shouldAutoScrollChat({
  listVisible,
  pendingScrollToEnd,
  listAtBottom,
}: {
  listVisible: boolean;
  pendingScrollToEnd: boolean;
  listAtBottom: boolean;
}): boolean {
  return listVisible && (pendingScrollToEnd || listAtBottom);
}

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
