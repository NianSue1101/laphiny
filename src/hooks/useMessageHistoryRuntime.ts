import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { getErrorMessage, showNotice } from '../app/app_utils';
import { prependMessagePage, type MessageHistoryInfo } from '../storage/message_pages';
import { loadAllMessages, loadMessageHistoryInfo, loadMessagePage } from '../storage/repository';
import type { ChatMessage } from '../types';

type HistoryState = MessageHistoryInfo & { loading: boolean };

export function useMessageHistoryRuntime({
  hydrated,
  normalizedSearchQuery,
  setMessagesByRoom,
}: {
  hydrated: boolean;
  normalizedSearchQuery: string;
  setMessagesByRoom: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
}) {
  const [historyByRoom, setHistoryByRoom] = useState<Record<string, HistoryState>>({});
  const [searchMessagesByRoom, setSearchMessagesByRoom] = useState<Record<string, ChatMessage[]> | null>(null);
  const [searchingFullHistory, setSearchingFullHistory] = useState(false);
  const [historySearchError, setHistorySearchError] = useState<string | null>(null);
  const searchSessionStartedRef = useRef(false);
  const loadingRoomsRef = useRef(new Set<string>());
  const searchActive = Boolean(normalizedSearchQuery);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void loadMessageHistoryInfo()
      .then((info) => {
        if (cancelled) return;
        setHistoryByRoom(Object.fromEntries(Object.entries(info).map(([roomId, item]) => [roomId, { ...item, loading: false }])));
      })
      .catch((error) => {
        if (!cancelled) setHistorySearchError(getErrorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated]);

  useEffect(() => {
    if (!searchActive) {
      searchSessionStartedRef.current = false;
      setSearchMessagesByRoom(null);
      setSearchingFullHistory(false);
      setHistorySearchError(null);
      return;
    }
    if (searchSessionStartedRef.current) return;
    searchSessionStartedRef.current = true;
    setSearchingFullHistory(true);
    setHistorySearchError(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadAllMessages()
        .then((messages) => {
          if (!cancelled) setSearchMessagesByRoom(messages);
        })
        .catch((error) => {
          if (!cancelled) setHistorySearchError(getErrorMessage(error));
        })
        .finally(() => {
          if (!cancelled) setSearchingFullHistory(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchActive]);

  async function loadEarlierMessages(roomId: string) {
    const history = historyByRoom[roomId];
    if (!history || history.nextOlderPage < 0 || loadingRoomsRef.current.has(roomId)) return;
    const pageIndex = history.nextOlderPage;
    loadingRoomsRef.current.add(roomId);
    setHistoryByRoom((current) => ({
      ...current,
      [roomId]: { ...current[roomId]!, loading: true },
    }));
    try {
      const olderPage = await loadMessagePage(roomId, pageIndex);
      setMessagesByRoom((current) => ({
        ...current,
        [roomId]: prependMessagePage(current[roomId] ?? [], olderPage),
      }));
      setHistoryByRoom((current) => ({
        ...current,
        [roomId]: { ...current[roomId]!, nextOlderPage: pageIndex - 1, loading: false },
      }));
    } catch (error) {
      setHistoryByRoom((current) => ({
        ...current,
        [roomId]: { ...current[roomId]!, loading: false },
      }));
      showNotice('加载更早消息失败', getErrorMessage(error));
    } finally {
      loadingRoomsRef.current.delete(roomId);
    }
  }

  return {
    historyByRoom,
    historySearchError,
    loadEarlierMessages,
    searchingFullHistory,
    searchMessagesByRoom,
  };
}
