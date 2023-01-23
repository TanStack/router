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
  onUpdate?: (next: TState, prev: TState) => void
}

export class Store<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  listeners = new Set<Listener<TState>>()
  state: TState
  options?: StoreOptions<TState, TUpdater>
  batching = false
  queue: ((...args: any[]) => void)[] = []

  constructor(initialState: TState, options?: StoreOptions<TState, TUpdater>) {
    this.state = initialState
    this.options = options
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

    if (this.state === previous) return

    this.queue.push(() => {
      this.listeners.forEach((listener) => listener(this.state, previous))
      this.options?.onUpdate?.(this.state, previous)
    })
    this.#flush()
  }

  #flush = () => {
    if (this.batching) return
    this.queue.forEach((cb) => cb())
    this.queue = []
  }

  batch = (cb: () => void) => {
    this.batching = true
    cb()
    this.batching = false
    this.#flush()
  }
}
