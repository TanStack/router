import { batch as storeBatch } from '@tanstack/store'

import { isServer } from '@tanstack/router-core/isServer'

// `@tanstack/store`'s `batch` is for reactive notification batching.
// On the server we don't subscribe/render reactively, so a lightweight
// implementation that just executes is enough.
export function batch<T>(fn: () => T): T {
  if (isServer) {
    return fn()
  }

  let result!: T
  storeBatch(() => {
    result = fn()
  })
  return result
}
