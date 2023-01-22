export type AnyUpdater = (...args: any[]) => any

interface StoreOptions<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  updateFn: (previous: TState) => (updater: TUpdater) => TState
}

export class Store<
  TState,
  TUpdater extends AnyUpdater = (cb: TState) => TState,
> {
  listeners = new Set<(next: TState, prev: TState) => void>()
  state: TState
  options?: StoreOptions<TState, TUpdater>
  batching = false
  queue: ((...args: any[]) => void)[] = []

  constructor(initialState: TState, options?: StoreOptions<TState, TUpdater>) {
    this.state = initialState
    this.options = options
  }

  subscribe = (listener: (next: TState, prev: TState) => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  setState = (updater: TUpdater) => {
    const previous = this.state
    this.state = this.options?.updateFn
      ? this.options.updateFn(previous)(updater)
      : (updater as any)(previous)

    this.queue.push(() =>
      this.listeners.forEach((listener) => listener(this.state, previous)),
    )
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
