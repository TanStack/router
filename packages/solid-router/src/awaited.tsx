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

function InnerAwait<T>(props: {
  promise: Promise<T>
  children: (res: T) => SolidNode
}) {
  // Solid components run once, so the React-style `throw promise` + re-read in
  // `useAwaited` never re-renders when the deferred promise resolves. Instead
  // drive an async memo: reading `data()` suspends through the enclosing
  // `<Loading>` until the promise settles, then re-renders reactively with the
  // resolved value (or rethrows the error to the nearest error boundary).
  const data = Solid.createMemo(async () => {
    const deferred = defer(props.promise)
    const state = deferred[TSR_DEFERRED_PROMISE]
    if (state.status === 'success') {
      return state.data
    }
    if (state.status === 'error') {
      throw state.error
    }
    return (await deferred) as T
  })
  return <>{props.children(data() as T)}</>
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  return (
    <Solid.Loading fallback={props.fallback as any}>
      <InnerAwait promise={props.promise}>{props.children}</InnerAwait>
    </Solid.Loading>
  )
}
