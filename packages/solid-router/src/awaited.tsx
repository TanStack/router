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
  // On the client, check if this is a deferred promise that has already resolved
  // Use ssrLoadFrom: 'initial' only for resolved deferred promises
  // This ensures serialized data is used during hydration, but streaming promises still work
  let ssrLoadFrom: 'initial' | 'server' = 'server'

  if (typeof document !== 'undefined') {
    const isDeferred = TSR_DEFERRED_PROMISE in (props.promise as any)
    if (isDeferred && (props.promise as any)[TSR_DEFERRED_PROMISE].status !== 'pending') {
      ssrLoadFrom = 'initial'
    }
  }

  const [resource] = Solid.createResource(() => props.promise, {
    ssrLoadFrom,
  })

  return (
    <Solid.Show fallback={props.fallback} when={resource()}>
      {(data) => props.children(data())}
    </Solid.Show>
  )
}
