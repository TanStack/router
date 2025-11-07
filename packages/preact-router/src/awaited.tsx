import { Suspense } from 'preact/compat'
import { useState, useEffect } from 'preact/hooks'
import type { ComponentChildren } from 'preact'

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
    fallback?: ComponentChildren
    children: (result: T) => ComponentChildren
  },
) {
  const inner = <AwaitInner {...props} />
  if (props.fallback) {
    return <Suspense fallback={props.fallback}>{inner}</Suspense>
  }
  return inner
}

function AwaitInner<T>(
  props: AwaitOptions<T> & {
    fallback?: ComponentChildren
    children: (result: T) => ComponentChildren
  },
): any {
  const [data] = useAwaited(props)

  return props.children(data) as any
}
