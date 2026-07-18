import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { shouldRecoverInterruptedMessage } from '../lib/stream_recovery';
import type { ChatMessage, Room } from '../types';

interface StreamRecoveryOptions {
  rooms: Room[];
  messagesByRoom: Record<string, ChatMessage[]>;
  activeStreamIds: Record<string, true>;
  onRecoverInterruptedMessage: (room: Room, message: ChatMessage) => Promise<void> | void;
  enabled?: boolean;
}

const RECOVERY_SCAN_INTERVAL_MS = 15_000;

/**
 * Reconciles interrupted replies after startup, foregrounding, connectivity
 * changes, and while an active app waits for a temporarily unavailable host.
 */
export function useStreamRecovery(options: StreamRecoveryOptions) {
  const latestRef = useRef(options);
  latestRef.current = options;
  const recoveringRef = useRef(new Set<string>());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (options.enabled === false) return undefined;

    const scan = () => {
      const latest = latestRef.current;
      if (latest.enabled === false || AppState.currentState !== 'active') return;
      for (const room of latest.rooms) {
        for (const message of latest.messagesByRoom[room.id] ?? []) {
          if (!shouldRecoverInterruptedMessage(message, latest.activeStreamIds)) continue;
          if (recoveringRef.current.has(message.id)) continue;
          if (!room.members.some((member) => member.enabled && member.connectionId === message.authorId)) continue;

          recoveringRef.current.add(message.id);
          void Promise.resolve(latest.onRecoverInterruptedMessage(room, message))
            .finally(() => recoveringRef.current.delete(message.id));
        }
      }
    };

    const scheduleScan = (delayMs = 750) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        scan();
      }, delayMs);
    };

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') scheduleScan();
    });
    const intervalId = setInterval(scan, RECOVERY_SCAN_INTERVAL_MS);
    const onlineHandler = () => scheduleScan(250);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('online', onlineHandler);
    }
    scheduleScan(250);

    return () => {
      appStateSubscription.remove();
      clearInterval(intervalId);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.removeEventListener('online', onlineHandler);
      }
    };
  }, [options.enabled]);
}

