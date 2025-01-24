import type { ControllablePromise } from '@tanstack/react-router'
import type { StartSsrGlobal } from '@tanstack/start-client'

const __TSR_SSR__: StartSsrGlobal = {
  matches: [],
  streamedValues: {},
  queue: [],
  runQueue: () => {
    let changed = false as boolean
    __TSR_SSR__.queue = __TSR_SSR__.queue.filter((fn) => {
      if (fn()) {
        changed = true
        return false
      }
      return true
    })
    if (changed) {
      __TSR_SSR__.runQueue()
    }
  },
  initMatch: (match) => {
    __TSR_SSR__.queue.push(() => {
      __TSR_SSR__.matches.push(match)

      Object.entries(match.extracted).forEach(([_id, ex]) => {
        if (ex.type === 'stream') {
          let controller
          ex.value = new ReadableStream({
            start(c) {
              controller = {
                enqueue: (chunk: unknown) => {
                  try {
                    c.enqueue(chunk)
                  } catch {}
                },
                close: () => {
                  try {
                    c.close()
                  } catch {}
                },
              }
            },
          })
          ex.value.controller = controller
        } else {
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

      return true
    })

    __TSR_SSR__.runQueue()
  },
  resolvePromise: (p) => {
    __TSR_SSR__.queue.push(() => {
      const match = __TSR_SSR__.matches[p.matchIndex]
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

    __TSR_SSR__.runQueue()
  },
  cleanScripts: () => {
    document.querySelectorAll('.tsr-once').forEach((el) => {
      el.remove()
    })
  },
}

window.__TSR_SSR__ = __TSR_SSR__
