import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import { getErrorMessage, showNotice } from '../app/app_utils';
import { prependMessagePage, type MessageHistoryInfo } from '../storage/message_pages';
import { loadMessageHistoryInfo, loadMessagePage, searchMessages } from '../storage/repository';
import type { ChatMessage } from '../types';

export type MessageHistoryRoomState = MessageHistoryInfo & { loading: boolean; error?: string };

export function useMessageHistoryRuntime({
  hydrated,
  normalizedSearchQuery,
  onStorageIssue,
  setMessagesByRoom,
}: {
  hydrated: boolean;
  normalizedSearchQuery: string;
  onStorageIssue?: (title: string, message: string, roomId?: string) => void;
  setMessagesByRoom: Dispatch<SetStateAction<Record<string, ChatMessage[]>>>;
}) {
  const [historyByRoom, setHistoryByRoom] = useState<Record<string, MessageHistoryRoomState>>({});
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [searchMessagesByRoom, setSearchMessagesByRoom] = useState<Record<string, ChatMessage[]> | null>(null);
  const [searchingFullHistory, setSearchingFullHistory] = useState(false);
  const [historySearchError, setHistorySearchError] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const loadingRoomsRef = useRef(new Set<string>());
  const onStorageIssueRef = useRef(onStorageIssue);

  useEffect(() => {
    onStorageIssueRef.current = onStorageIssue;
  }, [onStorageIssue]);

  const refreshMessageHistory = useCallback(async () => {
    setHistoryLoadError(null);
    try {
      const info = await loadMessageHistoryInfo();
      setHistoryByRoom(Object.fromEntries(Object.entries(info).map(([roomId, item]) => [
        roomId,
        { ...item, loading: false },
      ])));
    } catch (error) {
      const message = getErrorMessage(error);
      setHistoryLoadError(message);
      onStorageIssueRef.current?.('消息历史索引读取失败', message);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    void refreshMessageHistory().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [hydrated, refreshMessageHistory]);

  useEffect(() => {
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    if (!normalizedSearchQuery) {
      setSearchMessagesByRoom(null);
      setSearchingFullHistory(false);
      setHistorySearchError(null);
      return;
    }
    setSearchingFullHistory(true);
    setHistorySearchError(null);
    let cancelled = false;
    const timer = setTimeout(() => {
      void searchMessages(normalizedSearchQuery)
        .then((messages) => {
          if (!cancelled && searchRequestRef.current === requestId) setSearchMessagesByRoom(messages);
        })
        .catch((error) => {
          if (!cancelled && searchRequestRef.current === requestId) {
            const message = getErrorMessage(error);
            setHistorySearchError(message);
            onStorageIssueRef.current?.('完整历史搜索失败', message);
          }
        })
        .finally(() => {
          if (!cancelled && searchRequestRef.current === requestId) setSearchingFullHistory(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [normalizedSearchQuery]);

  async function loadEarlierMessages(roomId: string) {
    const history = historyByRoom[roomId];
    if (!history || history.nextOlderPage < 0 || loadingRoomsRef.current.has(roomId)) return;
    const pageIndex = history.nextOlderPage;
    loadingRoomsRef.current.add(roomId);
    setHistoryByRoom((current) => ({
      ...current,
      [roomId]: { ...current[roomId]!, loading: true, error: undefined },
    }));
    try {
      const olderPage = await loadMessagePage(roomId, pageIndex);
      setMessagesByRoom((current) => ({
        ...current,
        [roomId]: prependMessagePage(current[roomId] ?? [], olderPage),
      }));
      setHistoryByRoom((current) => ({
        ...current,
        [roomId]: { ...current[roomId]!, nextOlderPage: pageIndex - 1, loading: false, error: undefined },
      }));
    } catch (error) {
      const message = getErrorMessage(error);
      setHistoryByRoom((current) => ({
        ...current,
        [roomId]: { ...current[roomId]!, loading: false, error: message },
      }));
      onStorageIssueRef.current?.('加载更早消息失败', message, roomId);
      showNotice('加载更早消息失败', message);
    } finally {
      loadingRoomsRef.current.delete(roomId);
    }
  }

  return {
    historyByRoom,
    historyLoadError,
    historySearchError,
    loadEarlierMessages,
    refreshMessageHistory,
    searchingFullHistory,
    searchMessagesByRoom,
  };
}
