export type AgentQueueScope = {
  roomId: string;
  connectionId: string;
};

/**
 * Serializes work for one Agent inside one room while leaving all other
 * room/Agent pairs independent. Rejections never poison the following task.
 */
export class AgentTaskScheduler {
  private readonly queues = new Map<string, Promise<void>>();

  schedule<T>(scope: AgentQueueScope, task: () => Promise<T>): Promise<T> {
    const key = makeAgentQueueKey(scope);
    const previous = this.queues.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const queued = result.then(() => undefined, () => undefined);
    this.queues.set(key, queued);
    void queued.finally(() => {
      if (this.queues.get(key) === queued) this.queues.delete(key);
    });
    return result;
  }

  isBusy(scope: AgentQueueScope): boolean {
    return this.queues.has(makeAgentQueueKey(scope));
  }

  activeKeys(): string[] {
    return Array.from(this.queues.keys());
  }
}

export function makeAgentQueueKey(scope: AgentQueueScope): string {
  return `${scope.roomId}:${scope.connectionId}`;
}
