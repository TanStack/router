import { produce, setAutoFreeze } from 'immer'

setAutoFreeze(false)

// interface StoreOptions {
//   onSubscribe?: () => (() => void) | void
// }

export class Store<TState> {
  listeners = new Set<(next: TState, prev: TState) => void>()
  state: TState
  // options?: StoreOptions
  batching = false
  queue: ((...args: any[]) => void)[] = []

  constructor(
    initialState: TState,
    // options?: StoreOptions
  ) {
    this.state = initialState
    // this.options = options
  }

  subscribe = (listener: (next: TState, prev: TState) => void) => {
    this.listeners.add(listener)
    // const unsub = this.options?.onSubscribe?.()
    return () => {
      this.listeners.delete(listener)
      // unsub?.()
    }
  }

  setState = (updater: (cb: TState) => void) => {
    const previous = this.state
    this.state = produce((d) => {
      updater(d)
    })(previous)

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
