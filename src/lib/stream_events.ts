import type { AgentStreamEvent, AgentStreamPhase, AgentStreamState, ChatMessage } from '../types';

export type RoomStreamSummary = {
  activeCount: number;
  phase: AgentStreamPhase;
  label: string;
  connectionIds: string[];
  updatedAt: string;
};

const TERMINAL_PHASES = new Set<AgentStreamPhase>(['completed', 'cancelled', 'failed']);
const ALLOWED_PHASES: Record<AgentStreamPhase, AgentStreamPhase[]> = {
  queued: ['connecting', 'cancelled', 'failed'],
  connecting: ['thinking', 'responding', 'delegating', 'reviewing', 'completed', 'cancelled', 'failed'],
  thinking: ['responding', 'delegating', 'reviewing', 'completed', 'cancelled', 'failed'],
  responding: ['thinking', 'delegating', 'reviewing', 'completed', 'cancelled', 'failed'],
  delegating: ['responding', 'reviewing', 'completed', 'cancelled', 'failed'],
  reviewing: ['responding', 'delegating', 'completed', 'cancelled', 'failed'],
  completed: [],
  cancelled: [],
  failed: [],
};

export type StreamEventInput = Omit<AgentStreamEvent, 'id' | 'sequence' | 'createdAt'> & {
  createdAt?: string;
};

export function makeInitialAgentStreamState({
  messageId,
  roomId,
  connectionId,
  now,
}: {
  messageId: string;
  roomId: string;
  connectionId: string;
  now: string;
}): AgentStreamState {
  return {
    messageId,
    roomId,
    connectionId,
    phase: 'queued',
    sequence: 0,
    content: '',
    startedAt: now,
    updatedAt: now,
  };
}

export function createAgentStreamEvent(state: AgentStreamState, input: StreamEventInput): AgentStreamEvent {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    ...input,
    id: `stream_${state.messageId}_${state.sequence + 1}`,
    sequence: state.sequence + 1,
    createdAt,
  };
}

export function reduceAgentStreamEvent(state: AgentStreamState, event: AgentStreamEvent): AgentStreamState {
  if (event.messageId !== state.messageId || event.roomId !== state.roomId || event.connectionId !== state.connectionId) {
    throw new Error('流事件与当前消息不匹配。');
  }
  if (event.sequence <= state.sequence) return state;
  if (event.phase !== state.phase && !ALLOWED_PHASES[state.phase].includes(event.phase)) {
    throw new Error(`非法流状态转换：${state.phase} → ${event.phase}`);
  }
  return {
    ...state,
    phase: event.phase,
    sequence: event.sequence,
    content: event.content ?? state.content,
    reasoning: event.reasoning ?? state.reasoning,
    error: event.error,
    updatedAt: event.createdAt,
    completedAt: isTerminalStreamPhase(event.phase) ? event.createdAt : undefined,
  };
}

export function isTerminalStreamPhase(phase: AgentStreamPhase): boolean {
  return TERMINAL_PHASES.has(phase);
}

export function getAgentStreamPhaseLabel(phase: AgentStreamPhase): string {
  if (phase === 'queued') return '排队中';
  if (phase === 'connecting') return '连接中';
  if (phase === 'thinking') return '思考中';
  if (phase === 'responding') return '回复中';
  if (phase === 'delegating') return '委托中';
  if (phase === 'reviewing') return '审查中';
  if (phase === 'completed') return '已完成';
  if (phase === 'cancelled') return '已取消';
  return '失败';
}

export function summarizeActiveAgentStreams(states: Record<string, AgentStreamState>): Record<string, RoomStreamSummary> {
  const result: Record<string, RoomStreamSummary> = {};
  for (const state of Object.values(states)) {
    if (isTerminalStreamPhase(state.phase)) continue;
    const current = result[state.roomId];
    const connectionIds = current?.connectionIds.includes(state.connectionId)
      ? current.connectionIds
      : [...(current?.connectionIds ?? []), state.connectionId];
    const latest = !current || state.updatedAt >= current.updatedAt;
    result[state.roomId] = {
      activeCount: (current?.activeCount ?? 0) + 1,
      phase: latest ? state.phase : current.phase,
      label: getAgentStreamPhaseLabel(latest ? state.phase : current.phase),
      connectionIds,
      updatedAt: latest ? state.updatedAt : current.updatedAt,
    };
  }
  return result;
}

export function shouldDisplayServiceReasoning(enabled: boolean, reasoning?: string): boolean {
  return enabled && Boolean(reasoning?.trim());
}

export function normalizeInterruptedChatMessages(messages: ChatMessage[], now: string): ChatMessage[] {
  return messages.map((message) => {
    if (message.authorId === 'user' || !['queued', 'running'].includes(message.status)) return message;
    return {
      ...message,
      content: message.content || '上次回复在应用退出时中断。',
      status: 'stopped',
      streamPhase: 'cancelled',
      streamUpdatedAt: now,
      error: message.error || '上次运行已中断，可以安全重试。',
    };
  });
}
