import { useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  createAgentStreamEvent,
  makeInitialAgentStreamState,
  reduceAgentStreamEvent,
  type StreamEventInput,
} from '../lib/stream_events';
import type { AgentStreamEvent, AgentStreamPhase, AgentStreamState, ChatMessage } from '../types';

type UpdateMessage = (roomId: string, messageId: string, patch: Partial<ChatMessage>) => void;

export function useStreamRegistry(updateMessage: UpdateMessage) {
  const [activeStreamIds, setActiveStreamIds] = useState<Record<string, true>>({});
  const [stoppingStreamIds, setStoppingStreamIds] = useState<Record<string, true>>({});
  const [streamStates, setStreamStates] = useState<Record<string, AgentStreamState>>({});
  const recentStreamEventsRef = useRef<AgentStreamEvent[]>([]);
  const streamControllersRef = useRef<Record<string, AbortController>>({});
  const streamFlushTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const streamBuffersRef = useRef<Record<string, Partial<ChatMessage>>>({});
  const streamStatesRef = useRef<Record<string, AgentStreamState>>({});

  function startStream(messageId: string, roomId: string, connectionId: string) {
    const now = new Date().toISOString();
    const state = makeInitialAgentStreamState({ messageId, roomId, connectionId, now });
    streamStatesRef.current[messageId] = state;
    setStreamStates((current) => ({ ...current, [messageId]: state }));
    const queuedEvent: AgentStreamEvent = {
      id: `stream_${messageId}_0`,
      messageId,
      roomId,
      connectionId,
      phase: 'queued',
      kind: 'status',
      sequence: 0,
      createdAt: now,
    };
    recentStreamEventsRef.current = [...recentStreamEventsRef.current, queuedEvent].slice(-200);
    updateMessage(roomId, messageId, { streamPhase: 'queued', streamUpdatedAt: now });
  }

  function emitStreamEvent(messageId: string, input: Omit<StreamEventInput, 'messageId' | 'roomId' | 'connectionId'>, updateStoredMessage = true) {
    const current = streamStatesRef.current[messageId];
    if (!current) return null;
    const event = createAgentStreamEvent(current, {
      ...input,
      messageId,
      roomId: current.roomId,
      connectionId: current.connectionId,
    });
    const next = reduceAgentStreamEvent(current, event);
    streamStatesRef.current[messageId] = next;
    setStreamStates((states) => ({ ...states, [messageId]: next }));
    recentStreamEventsRef.current = [...recentStreamEventsRef.current, { ...event, content: undefined, reasoning: undefined }].slice(-200);
    if (updateStoredMessage) {
      updateMessage(current.roomId, messageId, {
        streamPhase: next.phase,
        streamUpdatedAt: next.updatedAt,
        error: next.error,
      });
    }
    return event;
  }

  function markStreamPhase(messageId: string, phase: AgentStreamPhase, error?: string) {
    return emitStreamEvent(messageId, {
      phase,
      kind: phase === 'completed' || phase === 'cancelled' || phase === 'failed' || phase === 'interrupted' ? 'terminal' : 'status',
      error,
    });
  }

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
    const patch = streamBuffersRef.current[messageId];
    if (!patch) return;
    delete streamBuffersRef.current[messageId];
    const timer = streamFlushTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete streamFlushTimersRef.current[messageId];
    }
    const phase: AgentStreamPhase = patch.content?.trim()
      ? 'responding'
      : patch.reasoning?.trim()
        ? 'thinking'
        : streamStatesRef.current[messageId]?.phase ?? 'connecting';
    const event = emitStreamEvent(messageId, {
      phase,
      kind: patch.content?.trim() ? 'content' : patch.reasoning?.trim() ? 'reasoning' : 'status',
      content: patch.content,
      reasoning: patch.reasoning,
    }, false);
    updateMessage(roomId, messageId, {
      ...patch,
      streamPhase: event?.phase,
      streamUpdatedAt: event?.createdAt,
      error: event?.error,
    });
  }

  function queueStreamMessageUpdate(
    roomId: string,
    messageId: string,
    patch: Pick<ChatMessage, 'content'> & Partial<Pick<ChatMessage, 'reasoning' | 'activityNotices'>>,
  ) {
    streamBuffersRef.current[messageId] = { ...streamBuffersRef.current[messageId], ...patch };
    if (streamFlushTimersRef.current[messageId]) return;
    streamFlushTimersRef.current[messageId] = setTimeout(() => {
      flushStreamMessage(roomId, messageId);
    }, Platform.OS === 'android' ? 140 : 100);
  }

  function cleanupStream(messageId: string) {
    delete streamControllersRef.current[messageId];
    delete streamBuffersRef.current[messageId];
    delete streamStatesRef.current[messageId];
    const timer = streamFlushTimersRef.current[messageId];
    if (timer) {
      clearTimeout(timer);
      delete streamFlushTimersRef.current[messageId];
    }
    setStreamActive(messageId, false);
    setStreamStates((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
    setStoppingStreamIds((current) => {
      const next = { ...current };
      delete next[messageId];
      return next;
    });
  }

  function cleanupAllStreams() {
    for (const timer of Object.values(streamFlushTimersRef.current)) clearTimeout(timer);
    streamControllersRef.current = {};
    streamFlushTimersRef.current = {};
    streamBuffersRef.current = {};
    streamStatesRef.current = {};
    setActiveStreamIds({});
    setStoppingStreamIds({});
    setStreamStates({});
    recentStreamEventsRef.current = [];
  }

  return {
    activeStreamIds,
    recentStreamEvents: recentStreamEventsRef.current,
    stoppingStreamIds,
    streamStates,
    cleanupAllStreams,
    cleanupStream,
    emitStreamEvent,
    flushStreamMessage,
    markStreamPhase,
    queueStreamMessageUpdate,
    registerStreamController,
    setStreamActive,
    startStream,
    stopMessage,
  };
}
