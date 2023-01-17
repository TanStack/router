import { produce, setAutoFreeze } from 'immer'

setAutoFreeze(false)

export type Store<TState> = {
  state: TState
  subscribe: (listener: (next: TState, prev: TState) => void) => () => void
  setState: (updater: (cb: TState) => void) => void
}

let queue: ((...args: any[]) => void)[] = []
let batching = false

function flush() {
  if (batching) return
  queue.forEach((cb) => cb())
  queue = []
}

export function createStore<TState>(initialState: TState, debug?: boolean) {
  const listeners = new Set<(next: TState, prev: TState) => void>()

  const store: Store<TState> = {
    state: initialState,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setState: (updater) => {
      const previous = store.state
      store.state = produce((d) => {
        updater(d)
      })(previous)

      if (debug) console.log(store.state)

      queue.push(() =>
        listeners.forEach((listener) => listener(store.state, previous)),
      )
      flush()
    },
  }

  return store
}

export function batch(cb: () => void) {
  batching = true
  cb()
  batching = false
  flush()
}
