import type { AgentEvent } from '@mini/shared';

// In-process fan-out of AgentEvents to the SSE streams of a session (one server process in the slice).

export type AgentEventListener = (event: AgentEvent) => void;

export class AgentEventHub {
  private readonly listeners = new Map<string, Set<AgentEventListener>>();

  subscribe(sessionId: string, listener: AgentEventListener): () => void {
    let set = this.listeners.get(sessionId);
    if (!set) this.listeners.set(sessionId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(sessionId);
    };
  }

  emit(sessionId: string, event: AgentEvent): void {
    for (const listener of this.listeners.get(sessionId) ?? []) {
      try {
        listener(event);
      } catch {
        // A broken stream must never stop the loop.
      }
    }
  }

  listenerCount(sessionId: string): number {
    return this.listeners.get(sessionId)?.size ?? 0;
  }
}
