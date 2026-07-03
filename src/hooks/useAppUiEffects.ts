import { useEffect } from 'react';
import { Platform } from 'react-native';

import type { Tab } from '../app/app_types';
import type { Room } from '../types';

type UseAppUiEffectsOptions = {
  isWideLayout: boolean;
  managedRoomId: string | null;
  mobileFocusedRoomId: string | null;
  rooms: Room[];
  selectedRoomId: string | null;
  setManagedRoomId: any;
  setMessageSearchQuery: any;
  setMobileFocusedRoomId: any;
  setMobileRoomDetailsOpen: any;
  setQuickCommandsOpen: any;
  setRoomDetailsCollapsed: any;
  setRoomToolsOpen: any;
  setSelectedTargetIds: any;
  setUnreadByRoom: any;
  tab: Tab;
  totalUnread: number;
};

export function useAppUiEffects({
  isWideLayout,
  managedRoomId,
  mobileFocusedRoomId,
  rooms,
  selectedRoomId,
  setManagedRoomId,
  setMessageSearchQuery,
  setMobileFocusedRoomId,
  setMobileRoomDetailsOpen,
  setQuickCommandsOpen,
  setRoomDetailsCollapsed,
  setRoomToolsOpen,
  setSelectedTargetIds,
  setUnreadByRoom,
  tab,
  totalUnread,
}: UseAppUiEffectsOptions) {
  useEffect(() => {
    setSelectedTargetIds([]);
  }, [selectedRoomId]);

  useEffect(() => {
    if (isWideLayout || tab !== 'chat') {
      setMobileFocusedRoomId(null);
      setMobileRoomDetailsOpen(false);
    }
  }, [isWideLayout, tab]);

  useEffect(() => {
    if (mobileFocusedRoomId && !rooms.some((room) => room.id === mobileFocusedRoomId)) {
      setMobileFocusedRoomId(null);
      setMobileRoomDetailsOpen(false);
    }
    if (managedRoomId && !rooms.some((room) => room.id === managedRoomId)) {
      setManagedRoomId(null);
    }
  }, [managedRoomId, mobileFocusedRoomId, rooms]);

  useEffect(() => {
    setRoomDetailsCollapsed(!isWideLayout);
    setQuickCommandsOpen(false);
    setRoomToolsOpen(false);
    setMessageSearchQuery('');
  }, [selectedRoomId, isWideLayout]);

  useEffect(() => {
    if (selectedRoomId && tab === 'chat') {
      setUnreadByRoom((current: Record<string, number>) => {
        if (!current[selectedRoomId]) return current;
        const next = { ...current };
        delete next[selectedRoomId];
        return next;
      });
    }
    if (tab === 'square') {
      setUnreadByRoom((current: Record<string, number>) => {
        if (!current.__square) return current;
        const next = { ...current };
        delete next.__square;
        return next;
      });
    }
  }, [selectedRoomId, tab]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = totalUnread > 0 ? `(${totalUnread}) Laphiny` : 'Laphiny';
    }
  }, [totalUnread]);
}
