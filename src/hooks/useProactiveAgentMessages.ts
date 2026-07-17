import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { AppState, Platform } from 'react-native';

import { ingestProactiveAgentMessages, makeProactiveDeviceId, mergeProactiveMessages } from '../lib/proactive_messages';
import { LaphinySyncClient } from '../lib/sync_client';
import { saveMessages } from '../storage/repository';
import type { ChatMessage, DiagnosticLogEntry, ProactiveAgentMessageEvent, Room, SyncConfig } from '../types';

type DiagnosticInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

export function useProactiveAgentMessages({
  appendDiagnosticLog,
  appendMessagesToRoom,
  hydrated,
  messagesByRoom,
  rooms,
  setSyncConfig,
  syncConfig,
}: {
  appendDiagnosticLog: (input: DiagnosticInput) => void;
  appendMessagesToRoom: (roomId: string, messages: ChatMessage[]) => void;
  hydrated: boolean;
  messagesByRoom: Record<string, ChatMessage[]>;
  rooms: Room[];
  setSyncConfig: Dispatch<SetStateAction<SyncConfig>>;
  syncConfig: SyncConfig;
}) {
  const pollingRef = useRef(false);
  const deliveryChainRef = useRef<Promise<void>>(Promise.resolve());
  const unsupportedRef = useRef(false);
  const lastFailureLogAtRef = useRef(0);
  const messagesRef = useRef(messagesByRoom);
  const roomsRef = useRef(rooms);
  const syncConfigRef = useRef(syncConfig);
  const appendMessagesRef = useRef(appendMessagesToRoom);
  const appendDiagnosticRef = useRef(appendDiagnosticLog);

  messagesRef.current = messagesByRoom;
  roomsRef.current = rooms;
  syncConfigRef.current = syncConfig;
  appendMessagesRef.current = appendMessagesToRoom;
  appendDiagnosticRef.current = appendDiagnosticLog;

  useEffect(() => {
    unsupportedRef.current = false;
    if (!hydrated || !syncConfig.enabled || !syncConfig.baseUrl.trim()) return;
    let cancelled = false;
    let foreground = AppState.currentState === 'active';
    let streamController: AbortController | null = null;
    let streamRunning = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const ensureDeviceId = () => {
      let deviceId = syncConfigRef.current.deviceId;
      if (deviceId) return deviceId;
      deviceId = makeProactiveDeviceId();
      syncConfigRef.current = { ...syncConfigRef.current, deviceId };
      setSyncConfig((current) => ({ ...current, deviceId, updatedAt: new Date().toISOString() }));
      return deviceId;
    };

    const reportFailure = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (/HTTP 404:/u.test(message)) {
        if (!unsupportedRef.current) {
          appendDiagnosticRef.current({
            level: 'warning',
            category: 'sync',
            title: '同步后端不支持 Agent 主动消息',
            message: '请升级为独立 laphiny-sync 服务；普通快照同步仍可继续使用。',
          });
        }
        unsupportedRef.current = true;
        streamController?.abort();
      } else if (!isAbortError(error) && Date.now() - lastFailureLogAtRef.current >= 60_000) {
        lastFailureLogAtRef.current = Date.now();
        appendDiagnosticRef.current({
          level: 'warning',
          category: 'sync',
          title: 'Agent 主动消息连接失败',
          message,
        });
      }
    };

    const consumeEvents = async (client: LaphinySyncClient, events: ProactiveAgentMessageEvent[], nextCursor?: number) => {
      if (events.length === 0 || cancelled) return;
      const ingestion = ingestProactiveAgentMessages({
        events,
        rooms: roomsRef.current,
        messagesByRoom: messagesRef.current,
      });
      const acceptedCount = Object.values(ingestion.acceptedByRoom).reduce((total, items) => total + items.length, 0);
      if (acceptedCount > 0) {
        const durableMessages = mergeProactiveMessages(messagesRef.current, ingestion.acceptedByRoom);
        await saveMessages(durableMessages);
        if (cancelled) return;
        messagesRef.current = durableMessages;
        for (const [roomId, messages] of Object.entries(ingestion.acceptedByRoom)) {
          appendMessagesRef.current(roomId, messages);
        }
        appendDiagnosticRef.current({
          level: 'success',
          category: 'sync',
          title: 'Agent 主动消息已接收',
          message: `已将 ${acceptedCount} 条主动回复写入对应房间。`,
          meta: { accepted: acceptedCount, rejected: ingestion.rejected.length },
        });
      }
      for (const rejected of ingestion.rejected) {
        appendDiagnosticRef.current({
          level: 'warning',
          category: 'sync',
          title: 'Agent 主动消息已拒绝',
          message: rejected.reason,
          roomId: rejected.event.roomId,
          connectionId: rejected.event.connectionId,
          requestId: rejected.event.eventId,
        });
      }

      const cursor = Math.max(
        syncConfigRef.current.lastAgentMessageSequence ?? 0,
        nextCursor ?? 0,
        ingestion.lastSequence,
      );
      const deviceId = ensureDeviceId();
      await client.acknowledgeAgentMessages(deviceId, cursor, { timeoutMs: 8_000 });
      syncConfigRef.current = { ...syncConfigRef.current, deviceId, lastAgentMessageSequence: cursor };
      setSyncConfig((current) => ({
        ...current,
        deviceId,
        lastAgentMessageSequence: Math.max(current.lastAgentMessageSequence ?? 0, cursor),
        updatedAt: new Date().toISOString(),
      }));
    };

    const enqueueEvents = (client: LaphinySyncClient, events: ProactiveAgentMessageEvent[], nextCursor?: number) => {
      const delivery = deliveryChainRef.current.then(() => consumeEvents(client, events, nextCursor));
      deliveryChainRef.current = delivery.catch(() => {});
      return delivery;
    };

    const poll = async () => {
      if (cancelled || pollingRef.current || unsupportedRef.current) return;
      pollingRef.current = true;
      try {
        const client = new LaphinySyncClient(syncConfigRef.current);
        let cursor = syncConfigRef.current.lastAgentMessageSequence ?? 0;
        for (let pageIndex = 0; pageIndex < 10 && !cancelled; pageIndex += 1) {
          const page = await client.listAgentMessages({ after: cursor, limit: 100, timeoutMs: 10_000 });
          if (!Array.isArray(page.events) || page.events.length === 0) break;
          await enqueueEvents(client, page.events, page.nextCursor);
          cursor = Math.max(cursor, page.nextCursor);
          if (!page.hasMore) break;
        }
      } catch (error) {
        reportFailure(error);
      } finally {
        pollingRef.current = false;
      }
    };

    const startStream = () => {
      if (cancelled || !foreground || streamRunning || unsupportedRef.current) return;
      streamRunning = true;
      streamController = new AbortController();
      const controller = streamController;
      const client = new LaphinySyncClient(syncConfigRef.current);
      const after = syncConfigRef.current.lastAgentMessageSequence ?? 0;
      void (async () => {
        try {
          for await (const event of client.streamAgentMessages({ after, connectTimeoutMs: 10_000, signal: controller.signal })) {
            await enqueueEvents(client, [event], event.sequence);
          }
        } catch (error) {
          reportFailure(error);
        } finally {
          if (streamController === controller) streamController = null;
          streamRunning = false;
          if (!cancelled && foreground && !unsupportedRef.current) {
            reconnectTimer = setTimeout(startStream, 2_000);
          }
        }
      })();
    };

    const stopStream = () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = null;
      streamController?.abort();
      streamController = null;
    };

    void poll();
    startStream();
    const intervalId = setInterval(() => void poll(), 15_000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      foreground = state === 'active';
      if (foreground) {
        void poll();
        startStream();
      } else {
        stopStream();
      }
    });
    const handleVisibility = () => {
      if (typeof document === 'undefined') return;
      foreground = document.visibilityState === 'visible';
      if (foreground) {
        void poll();
        startStream();
      } else {
        stopStream();
      }
    };
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelled = true;
      stopStream();
      clearInterval(intervalId);
      appStateSubscription.remove();
      if (Platform.OS === 'web' && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [hydrated, syncConfig.enabled, syncConfig.baseUrl, syncConfig.apiKey]);
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || /aborted|aborterror/iu.test(error.message));
}
