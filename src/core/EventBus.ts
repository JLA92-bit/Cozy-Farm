/** Tiny typed event bus. Systems publish game events; listeners (achievements, quests, UI, audio) react. */
type Handler<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private handlers = new Map<keyof Events, Set<Handler<any>>>();
  private anyHandlers = new Set<(type: keyof Events, payload: unknown) => void>();

  on<K extends keyof Events>(type: K, fn: Handler<Events[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }

  onAny(fn: (type: keyof Events, payload: unknown) => void): () => void {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    const set = this.handlers.get(type);
    if (set) for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error(`[event ${String(type)}]`, e); }
    }
    for (const fn of this.anyHandlers) {
      try { fn(type, payload); } catch (e) { console.error('[event any]', e); }
    }
  }
}
