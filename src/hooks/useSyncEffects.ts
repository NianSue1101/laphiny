import { useEffect, type MutableRefObject } from 'react';
import { AppState, Platform } from 'react-native';

import { latestSquareEventTime, mergeSquareEvents } from '../app/app_utils';
import { LaphinySyncClient } from '../lib/sync_client';
import type { Tab } from '../app/app_types';
import type { SquareEvent, SyncConfig } from '../types';

type UseSyncEffectsOptions = {
  autoPullSyncSnapshot: (reason: 'startup' | 'foreground') => Promise<void>;
  hydrated: boolean;
  pollingSquareEventsRef: MutableRefObject<boolean>;
  setSquareEvents: any;
  setSyncConfig: any;
  setUnreadByRoom: any;
  squareEvents: SquareEvent[];
  syncConfig: SyncConfig;
  tab: Tab;
};

export function useSyncEffects({
  autoPullSyncSnapshot,
  hydrated,
  pollingSquareEventsRef,
  setSquareEvents,
  setSyncConfig,
  setUnreadByRoom,
  squareEvents,
  syncConfig,
  tab,
}: UseSyncEffectsOptions) {
  useEffect(() => {
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;
    let cancelled = false;

    const poll = async () => {
      if (pollingSquareEventsRef.current) return;
      pollingSquareEventsRef.current = true;
      try {
        const client = new LaphinySyncClient(syncConfig);
        const since = syncConfig.lastEventPulledAt ?? latestSquareEventTime(squareEvents);
        const events = await client.listEvents({ since, timeoutMs: 10_000 });
        if (cancelled || events.length === 0) return;

        setSquareEvents((current: SquareEvent[]) => mergeSquareEvents([...current, ...events]).slice(-300));
        const latest = latestSquareEventTime(events);
        setSyncConfig((current: SyncConfig) => ({
          ...current,
          lastEventPulledAt: latest || current.lastEventPulledAt,
          updatedAt: new Date().toISOString(),
        }));
        if (tab !== 'square') {
          setUnreadByRoom((current: Record<string, number>) => ({
            ...current,
            __square: (current.__square ?? 0) + events.length,
          }));
        }
      } catch {
        // Polling should stay quiet; manual sync actions surface errors.
      } finally {
        pollingSquareEventsRef.current = false;
      }
    };

    void poll();
    const intervalId = setInterval(() => void poll(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey, syncConfig.lastEventPulledAt, squareEvents, tab]);

  useEffect(() => {
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;

    void autoPullSyncSnapshot('startup');

    const handleAppStateChange = (nextState: string) => {
      if (nextState === 'active') void autoPullSyncSnapshot('foreground');
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void autoPullSyncSnapshot('foreground');
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      subscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey]);
}
