import * as Vue from 'vue'

import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import type { DeferredPromise } from '@tanstack/router-core'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>({
  promise: _promise,
}: AwaitOptions<T>): [T, DeferredPromise<T>] {
  const promise = defer(_promise)

  if (promise[TSR_DEFERRED_PROMISE].status === 'pending') {
    throw promise
  }

  if (promise[TSR_DEFERRED_PROMISE].status === 'error') {
    throw promise[TSR_DEFERRED_PROMISE].error
  }

  return [promise[TSR_DEFERRED_PROMISE].data, promise]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: Vue.VNode
    children: (result: T) => Vue.VNode
  },
) {
  const data = Vue.ref<T | null>(null)
  const error = Vue.ref<Error | null>(null)
  const pending = Vue.ref(true)

  Vue.watchEffect(async () => {
    pending.value = true
    try {
      data.value = await props.promise
    } catch (err) {
      error.value = err as Error
    } finally {
      pending.value = false
    }
  })

  const inner = Vue.computed(() => {
    if (error.value) throw error.value
    if (pending.value) return props.fallback
    return props.children(data.value as T)
  })

  return () => inner.value
}
