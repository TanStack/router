import * as Solid from 'solid-js'

import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import type { DeferredPromise } from '@tanstack/router-core'
import type { SolidNode } from './route'

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
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  // Check if this is a deferred promise from TanStack Router
  const isDeferred = TSR_DEFERRED_PROMISE in (props.promise as any)

  // Use ssrLoadFrom: 'initial' only for deferred promises that have already resolved
  // This ensures serialized data is used during hydration, but streaming promises still work
  const ssrLoadFrom = isDeferred && (props.promise as any)[TSR_DEFERRED_PROMISE].status !== 'pending'
    ? 'initial'
    : 'server'

  const [resource] = Solid.createResource(() => props.promise, {
    ssrLoadFrom: typeof document !== 'undefined' ? ssrLoadFrom : 'server',
  })

  return (
    <Solid.Show fallback={props.fallback} when={resource()}>
      {(data) => props.children(data())}
    </Solid.Show>
  )
}
