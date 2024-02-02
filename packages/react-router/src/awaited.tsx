import * as React from 'react'
import warning from 'tiny-warning'
import { defaultDeserializeError, isServerSideError } from './Matches'
import { useRouter } from './useRouter'
import { DeferredPromise, isDehydratedDeferred } from './defer'
import { defaultSerializeError } from './router'
import invariant from 'tiny-invariant'

export type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}

export function useAwaited<T>({ promise }: AwaitOptions<T>): [T] {
  const router = useRouter()

  let state = promise.__deferredState
  const key = `__TSR__DEFERRED__${state.uid}`

  // There's a chance that the promise was resolved before rendering
  // on the server which means that it was be dehydrated in the critical
  // JSON with the rest of the router state. If that's the case
  // it's status will be 'success' and we can just use the data as is
  // and skip streamed hydration.

  if (isDehydratedDeferred(promise) && state.status === 'pending') {
    const dehydratedState = router.hydrateData(key)
    if (!state) throw new Error('Could not find dehydrated data')
    Object.assign(state, dehydratedState)
    promise = Promise.resolve(state.data) as DeferredPromise<any>
    promise.__deferredState = state
  }

  if (state.status === 'pending') throw promise

  if (state.status === 'error') {
    if (typeof document !== 'undefined') {
      if (isServerSideError(state.error)) {
        throw (
          router.options.errorSerializer?.deserialize ?? defaultDeserializeError
        )(state.error.data as any)
      } else {
        warning(
          false,
          "Encountered a server-side error that doesn't fit the expected shape",
        )
        throw state.error
      }
    } else {
      router.dehydrateData(key, state)
      throw {
        data: (
          router.options.errorSerializer?.serialize ?? defaultSerializeError
        )(state.error),
        __isServerError: true,
      }
    }
  }

  // TODO: This should only happen on the server
  if (!isDehydratedDeferred(promise)) {
    router.dehydrateData(key, state)
  }

  return [state.data as any]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: JSX.Element
    children: (result: T) => JSX.Element
  },
) {
  const inner = <AwaitInner {...props} />
  if (props.fallback) {
    return <React.Suspense fallback={props.fallback}>{inner}</React.Suspense>
  }
  return inner
}

function AwaitInner<T>(
  props: AwaitOptions<T> & {
    fallback?: JSX.Element
    children: (result: T) => JSX.Element
  },
) {
  const awaited = useAwaited(props)
  return props.children(...awaited)
}
