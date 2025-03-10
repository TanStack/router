import type { ControllablePromise } from '@tanstack/router-core'
import type { StartSsrGlobal } from '@tanstack/start-client-core'

const __TSR_SSR__: StartSsrGlobal = {
  matches: [],
  streamedValues: {},
  initMatch: (match) => {
    __TSR_SSR__.matches.push(match)

    match.extracted?.forEach((ex) => {
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
  },
  resolvePromise: ({ matchId, id, promiseState }) => {
    const match = __TSR_SSR__.matches.find((m) => m.id === matchId)
    if (match) {
      const ex = match.extracted?.[id]
      if (
        ex &&
        ex.type === 'promise' &&
        ex.value &&
        promiseState.status === 'success'
      ) {
        ex.value.resolve(promiseState.data)
        return true
      }
    }
    return false
  },
  injectChunk: ({ matchId, id, chunk }) => {
    const match = __TSR_SSR__.matches.find((m) => m.id === matchId)

    if (match) {
      const ex = match.extracted?.[id]
      if (ex && ex.type === 'stream' && ex.value?.controller) {
        ex.value.controller.enqueue(new TextEncoder().encode(chunk.toString()))
        return true
      }
    }
    return false
  },
  closeStream: ({ matchId, id }) => {
    const match = __TSR_SSR__.matches.find((m) => m.id === matchId)
    if (match) {
      const ex = match.extracted?.[id]
      if (ex && ex.type === 'stream' && ex.value?.controller) {
        ex.value.controller.close()
        return true
      }
    }
    return false
  },
  cleanScripts: () => {
    document.querySelectorAll('.tsr-once').forEach((el) => {
      el.remove()
    })
  },
}

window.__TSR_SSR__ = __TSR_SSR__
