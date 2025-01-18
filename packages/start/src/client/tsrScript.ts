import type {
  ControllablePromise,
  DeferredPromiseState,
  TSRGlobal,
  TSRGlobalMatch,
} from '@tanstack/react-router'

export interface ResolvePromiseState {
  id: number
  matchIndex: number
  promiseState: DeferredPromiseState<any>
}
interface StartTSRGlobal extends TSRGlobal {
  queue: Array<() => boolean>
  runQueue: () => void
  initMatch: (match: TSRGlobalMatch) => void
  resolvePromise: (p: ResolvePromiseState) => void
}

declare module '@tanstack/react-router' {
  interface Register {
    __TSR__: StartTSRGlobal
  }
}

const __TSR__: StartTSRGlobal = {
  matches: [],
  streamedValues: {},
  queue: [],
  runQueue: () => {
    let changed = false as boolean
    __TSR__.queue = __TSR__.queue.filter((fn) => {
      if (fn()) {
        changed = true
        return false
      }
      return true
    })
    if (changed) {
      __TSR__.runQueue()
    }
  },
  initMatch: (match) => {
    __TSR__.queue.push(() => {
      if (!__TSR__.matches[match.index]) {
        __TSR__.matches[match.index] = match
        Object.entries(match.extracted).forEach(([id, ex]) => {
          if (ex.type === 'stream') {
            let controller
            ex.value = new ReadableStream({
              start(c) {
                controller = c
              },
            })
            ex.value.controller = controller
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          } else if (ex.type === 'promise') {
            let resolve: ControllablePromise['reject'] | undefined
            let reject: ControllablePromise['reject'] | undefined

            ex.value = new Promise((_resolve, _reject) => {
              reject = _reject
              resolve = _resolve
            }) as ControllablePromise
            ex.value.reject = reject!
            ex.value.resolve = resolve!
          }
        })
      }

      return true
    })

    __TSR__.runQueue()
  },
  resolvePromise: (p) => {
    __TSR__.queue.push(() => {
      const match = __TSR__.matches[p.matchIndex]
      if (match) {
        const ex = match.extracted[p.id]
        if (
          ex &&
          ex.type === 'promise' &&
          ex.value &&
          p.promiseState.status === 'success'
        ) {
          ex.value.resolve(p.promiseState.data)
          return true
        }
      }
      return false
    })

    __TSR__.runQueue()
  },
  cleanScripts: () => {
    document.querySelectorAll('.tsr-once').forEach((el) => {
      el.remove()
    })
  },
}

window.__TSR__ = __TSR__
