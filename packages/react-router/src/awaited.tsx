import * as React from 'react'
import warning from 'tiny-warning'
import { useRouter } from './useRouter'
import { defaultSerializeError } from './router'
import { TSR_DEFERRED_PROMISE, defer } from './defer'
import { defaultDeserializeError, isServerSideError } from './isServerSideError'
import type { DeferredPromise } from './defer'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

export function useAwaited<T>({
  promise: _promise,
}: AwaitOptions<T>): [T, DeferredPromise<T>] {
  const router = useRouter()
  const promise = defer(_promise)

  if (promise[TSR_DEFERRED_PROMISE].status === 'pending') {
    throw promise
  }

  if (promise[TSR_DEFERRED_PROMISE].status === 'error') {
    if (typeof document !== 'undefined') {
      if (isServerSideError(promise[TSR_DEFERRED_PROMISE].error)) {
        throw (
          router.options.errorSerializer?.deserialize ?? defaultDeserializeError
        )(promise[TSR_DEFERRED_PROMISE].error.data as any)
      } else {
        warning(
          false,
          "Encountered a server-side error that doesn't fit the expected shape",
        )
        throw promise[TSR_DEFERRED_PROMISE].error
      }
    } else {
      throw {
        data: (
          router.options.errorSerializer?.serialize ?? defaultSerializeError
        )(promise[TSR_DEFERRED_PROMISE].error),
        __isServerError: true,
      }
    }
  }
  return [promise[TSR_DEFERRED_PROMISE].data, promise]
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
): React.JSX.Element {
  const [data] = useAwaited(props)

  return props.children(data) as React.JSX.Element
}
