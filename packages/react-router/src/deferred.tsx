import { DeferredPromise, isDehydratedDeferred } from '@tanstack/router-core'
import { useRouter } from '.'

export type DeferredOptions<T> = {
  promise: DeferredPromise<T>
}

export function useDeferred<T>({ promise }: DeferredOptions<T>): [T] {
  const router = useRouter()

  let state = promise.__deferredState
  const key = `__TSR__DEFERRED__${state.uid}`

  if (isDehydratedDeferred(promise)) {
    state = router.hydrateData(key)!
    promise = Promise.resolve(state.data) as DeferredPromise<any>
    promise.__deferredState = state
  }

  if (state.status === 'pending') {
    throw promise
  }

  if (state.status === 'error') {
    throw state.error
  }

  router.dehydrateData(key, state)

  return [state.data]
}

export function Deferred<T>(
  props: DeferredOptions<T> & {
    children: (result: T) => JSX.Element
  },
) {
  const awaited = useDeferred(props)
  return props.children(...awaited)
}
