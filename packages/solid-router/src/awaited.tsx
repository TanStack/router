import * as Solid from 'solid-js'

import { TSR_DEFERRED_PROMISE, defer } from '@tanstack/router-core'
import type { DeferredPromise } from '@tanstack/router-core'
import type { SolidNode } from './route'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>({
  promise: _promise,
}: AwaitOptions<T>): [data: T, promise: DeferredPromise<T>] {
  const promise = defer(_promise)
  const data = Solid.createMemo(async () => await promise)

  return [data(), promise]
}

function InnerAwait<T>(props: {
  deferred: DeferredPromise<T>
  ready: Solid.Accessor<unknown>
  children: (res: T) => SolidNode
}) {
  return (
    <Solid.Show when={props.ready()}>
      {(_) => {
        const state = props.deferred[TSR_DEFERRED_PROMISE]
        if (state.status === 'error') {
          throw state.error
        }
        return props.children(state.data as T) as any
      }}
    </Solid.Show>
  )
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  const deferred = defer(props.promise)
  const ready = Solid.createMemo(async () => {
    await deferred
    return true
  })

  return (
    <Solid.Loading fallback={props.fallback as any}>
      <InnerAwait deferred={deferred} ready={ready}>
        {props.children}
      </InnerAwait>
    </Solid.Loading>
  )
}
