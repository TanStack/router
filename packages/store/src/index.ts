export type AnyUpdater = (...args: any[]) => any

export type Listener<TState> = (next: TState, prev: TState) => void

interface StoreOptions<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  updateFn?: (previous: TState) => (updater: TUpdater) => TState
  onSubscribe?: (
    listener: Listener<TState>,
    store: Store<TState, TUpdater>,
  ) => () => void
  onUpdate?: (next: TState, prev: TState) => TState
}

export class Store<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  listeners = new Set<Listener<TState>>()
  state: TState
  options?: StoreOptions<TState, TUpdater>
  #batching = false
  #flushing = 0

  constructor(initialState: TState, options?: StoreOptions<TState, TUpdater>) {
    this.state = initialState
    this.options = options
    if (this.options?.onUpdate) {
      this.subscribe(this.options?.onUpdate)
    }
  }

  subscribe = (listener: Listener<TState>) => {
    this.listeners.add(listener)
    const unsub = this.options?.onSubscribe?.(listener, this)
    return () => {
      this.listeners.delete(listener)
      unsub?.()
    }
  }

  setState = (updater: TUpdater) => {
    const previous = this.state
    this.state = this.options?.updateFn
      ? this.options.updateFn(previous)(updater)
      : (updater as any)(previous)

    this.#flush(previous)
  }

  #flush = (previous: TState) => {
    if (this.#batching) return
    const flushId = ++this.#flushing
    this.listeners.forEach((listener) => {
      if (this.#flushing !== flushId || this.state === previous) return
      listener(this.state, previous)
    })
  }

  batch = (cb: () => void) => {
    if (this.#batching) return cb()
    const previous = this.state
    this.#batching = true
    cb()
    this.#batching = false
    this.#flush(previous)
  }
}
