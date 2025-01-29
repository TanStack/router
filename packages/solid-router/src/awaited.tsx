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
  const inner = <AwaitInner {...props} />
  if (props.fallback) {
    return <Solid.Suspense fallback={props.fallback}>{inner}</Solid.Suspense>
  }
  return inner
}

function AwaitInner<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
): Solid.JSX.Element {
  const [data] = useAwaited(props)

  return props.children(data)
}
