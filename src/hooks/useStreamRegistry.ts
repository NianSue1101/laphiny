import { useRef, useState } from 'react';

import type { ChatMessage } from '../types';

type UpdateMessage = (roomId: string, messageId: string, patch: Partial<ChatMessage>) => void;

export function useStreamRegistry(updateMessage: UpdateMessage) {
  const [activeStreamIds, setActiveStreamIds] = useState<Record<string, true>>({});
  const [stoppingStreamIds, setStoppingStreamIds] = useState<Record<string, true>>({});
  const streamControllersRef = useRef<Record<string, AbortController>>({});
  const streamFlushTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const streamBuffersRef = useRef<Record<string, string>>({});

  function setStreamActive(messageId: string, active: boolean) {
    setActiveStreamIds((current) => {
      const next = { ...current };
      if (active) next[messageId] = true;
      else delete next[messageId];
      return next;
    });
  }

  function registerStreamController(messageId: string, controller: AbortController) {
    streamControllersRef.current[messageId] = controller;
  }

  function stopMessage(messageId: string) {
    if (!streamControllersRef.current[messageId]) return;
    setStoppingStreamIds((current) => ({ ...current, [messageId]: true }));
    streamControllersRef.current[messageId]?.abort();
  }

  function flushStreamMessage(roomId: string, messageId: string) {
    const content = streamBuffersRef.current[messageId];
    if (content === undefined) return;
    delete streamBuffersRef.current[messageId];
    const timer = streamFlushTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete streamFlushTimersRef.current[messageId];
    }
    updateMessage(roomId, messageId, { content });
  }

  function queueStreamMessageUpdate(roomId: string, messageId: string, content: string) {
    streamBuffersRef.current[messageId] = content;
    if (streamFlushTimersRef.current[messageId]) return;
    streamFlushTimersRef.current[messageId] = setTimeout(() => {
      flushStreamMessage(roomId, messageId);
    }, 80);
  }

  function cleanupStream(messageId: string) {
    delete streamControllersRef.current[messageId];
    delete streamBuffersRef.current[messageId];
    const timer = streamFlushTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete streamFlushTimersRef.current[messageId];
    }
    setStreamActive(messageId, false);
    setStoppingStreamIds((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function cleanupAllStreams() {
    for (const timer of Object.values(streamFlushTimersRef.current)) {
      clearTimeout(timer);
    }
    streamControllersRef.current = {};
    streamFlushTimersRef.current = {};
    streamBuffersRef.current = {};
    setActiveStreamIds({});
    setStoppingStreamIds({});
  }

  return {
    activeStreamIds,
    stoppingStreamIds,
    cleanupAllStreams,
    cleanupStream,
    flushStreamMessage,
    queueStreamMessageUpdate,
    registerStreamController,
    setStreamActive,
    stopMessage,
  };
}
