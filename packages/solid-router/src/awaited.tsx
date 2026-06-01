import * as Solid from 'solid-js'

import { defer } from '@tanstack/router-core'
import type { DeferredPromise } from '@tanstack/router-core'
import type { SolidNode } from './route'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>({
  promise: _promise,
}: AwaitOptions<T>): [T, DeferredPromise<T>] {
  const promise = defer(_promise)
  const data = Solid.createMemo(async () => await promise)

  return [data(), promise]
}

function InnerAwait<T>(props: {
  data: Solid.Accessor<T>
  children: (res: T) => SolidNode
}) {
  return props.children(props.data()) as any
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: SolidNode
    children: (result: T) => SolidNode
  },
) {
  const data = Solid.createMemo(async () => await defer(props.promise))

  return (
    <Solid.Loading fallback={props.fallback as any}>
      <InnerAwait data={data}>{props.children}</InnerAwait>
    </Solid.Loading>
  )
}
