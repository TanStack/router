import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import { Suspense } from './Suspense'
import type { ComponentChildren, VNode } from 'preact'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

/** Suspend until a deferred promise resolves or rejects and return its data. */
export function useAwaited<T>({ promise: _promise }: AwaitOptions<T>): T {
  // No React.use in Preact - use throw-promise pattern for suspense
  const promise = defer(_promise)

  if (promise[TSR_DEFERRED_PROMISE].status === 'pending') {
    throw promise
  }

  if (promise[TSR_DEFERRED_PROMISE].status === 'error') {
    throw promise[TSR_DEFERRED_PROMISE].error
  }

  return promise[TSR_DEFERRED_PROMISE].data
}

/**
 * Component that suspends on a deferred promise and renders its child with
 * the resolved value. Optionally provides a Suspense fallback.
 */
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
) {
  const data = useAwaited(props)

  return props.children(data) as VNode
}
