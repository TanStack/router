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
  // Wrap the promise with defer() to ensure it's tracked properly
  // This is idempotent - if already deferred, it returns the same promise
  const deferredPromise = Solid.createMemo(() => defer(props.promise))

  const [resource] = Solid.createResource(deferredPromise)

  return (
    <Solid.Show fallback={props.fallback} when={resource()}>
      {(data) => props.children(data())}
    </Solid.Show>
  )
}
