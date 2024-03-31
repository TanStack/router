import * as React from 'react'
import warning from 'tiny-warning'
import { useRouter } from './useRouter'
import { defaultSerializeError } from './router'
import { isDehydratedDeferred } from './defer'
import { defaultDeserializeError, isServerSideError } from './Matches'
import type { DeferredPromise } from './defer'

export type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}

export function useAwaited<T>({ promise }: AwaitOptions<T>): [T] {
  const router = useRouter()
  // const rerender = React.useReducer((x) => x + 1, 0)[1]

  const state = promise.__deferredState

  // Dehydrated promises only
  // Successful or errored deferred promises mean they
  // were resolved on the server and no further action is needed
  if (isDehydratedDeferred(promise) && state.status === 'pending') {
    const streamedData = (window as any)[`__TSR__DEFERRED__${state.uid}`]

    if (streamedData) {
      Object.assign(state, router.options.transformer.parse(streamedData))
    } else {
      let token = router.registeredDeferredsIds.get(state.uid)

      // If we haven't yet, create a promise and resolver that our streamed HTML can use
      // when the client-side data is streamed in and ready.
      if (!token) {
        token = {}
        router.registeredDeferredsIds.set(state.uid, token)
        router.registeredDeferreds.set(token, state)

        Object.assign(state, {
          resolve: () => {
            state.__resolvePromise?.()
            // rerender()
          },
          promise: new Promise((r) => {
            state.__resolvePromise = r as any
          }),
          __resolvePromise: () => {},
        })
      }
    }
  }

  // If the promise is pending, always throw the state.promise
  // For originating promises, this will be the original promise
  // For dehydrated promises, this will be the placeholder promise
  // that will be resolved when the server sends the real data
  if (state.status === 'pending') {
    throw isDehydratedDeferred(promise) ? state.promise : promise
  }

  // If we are the originator of the promise,
  // inject the state into the HTML stream
  if (!isDehydratedDeferred(promise)) {
    router.injectHtml(`<script class='tsr_deferred_data'>window.__TSR__DEFERRED__${state.uid} = ${JSON.stringify(router.options.transformer.stringify(state))}</script>
<script class='tsr_deferred_handler'>
  if (window.__TSR__ROUTER__) {
    let deferred = window.__TSR__ROUTER__.getDeferred('${state.uid}')
    if (deferred) deferred.resolve(window.__TSR__DEFERRED__${state.uid})
  }
  document.querySelectorAll('.tsr_deferred_handler').forEach((el) => el.parentElement.removeChild(el))
</script>`)
  }

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
      throw {
        data: (
          router.options.errorSerializer?.serialize ?? defaultSerializeError
        )(state.error),
        __isServerError: true,
      }
    }
  }

  return [promise.__deferredState.data as any]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    fallback?: React.ReactNode
    children: (result: T) => React.ReactNode
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
    fallback?: React.ReactNode
    children: (result: T) => React.ReactNode
  },
) {
  const awaited = useAwaited(props)
  return props.children(...awaited) as React.JSX.Element
}
