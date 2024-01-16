import { defaultDeserializeError } from './Matches'
import { useRouter } from './RouterProvider'
import { DeferredPromise, isDehydratedDeferred } from './defer'

export type AwaitOptions<T> = {
  promise: DeferredPromise<T>
}

export function useAwaited<T>({ promise }: AwaitOptions<T>): [T] {
  const router = useRouter()

  let state = promise.__deferredState
  const key = `__TSR__DEFERRED__${state.uid}`

  if (isDehydratedDeferred(promise)) {
    state = router.hydrateData(key)!
    if (!state) throw new Error('Could not find dehydrated data')
    promise = Promise.resolve(state.data) as DeferredPromise<any>
    promise.__deferredState = state
  }

  if (state.status === 'pending') {
    throw new Promise((r) => setTimeout(r, 1)).then(() => promise)
  }

  if (state.status === 'error') {
    if (typeof document !== 'undefined') {
      throw (router.options.deserializeError ?? defaultDeserializeError)(
        state.error as any,
      )
    } else {
      router.dehydrateData(key, state)
      throw state.error
    }
  }

  router.dehydrateData(key, state)

  return [state.data]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    children: (result: T) => JSX.Element
  },
) {
  const awaited = useAwaited(props)
  return props.children(...awaited)
}
