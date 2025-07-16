import { defaultSerializeError } from './router'

export const TSR_DEFERRED_PROMISE = Symbol.for('TSR_DEFERRED_PROMISE')

export type DeferredPromiseState<T> =
  | {
      status: 'pending'
      data?: T
      error?: unknown
    }
  | {
      status: 'success'
      data: T
    }
  | {
      status: 'error'
      data?: T
      error: unknown
    }

export type DeferredPromise<T> = Promise<T> & {
  [TSR_DEFERRED_PROMISE]: DeferredPromiseState<T>
}

export function defer<T>(
  _promise: Promise<T>,
  options?: {
    serializeError?: typeof defaultSerializeError
  },
) {
  const promise = _promise as DeferredPromise<T>
  // this is already deferred promise
  if ((promise as any)[TSR_DEFERRED_PROMISE]) {
    return promise
  }
  promise[TSR_DEFERRED_PROMISE] = { status: 'pending' }

  promise
    .then((data) => {
      promise[TSR_DEFERRED_PROMISE].status = 'success'
      promise[TSR_DEFERRED_PROMISE].data = data
    })
    .catch((error) => {
      promise[TSR_DEFERRED_PROMISE].status = 'error'
      ;(promise[TSR_DEFERRED_PROMISE] as any).error = {
        data: (options?.serializeError ?? defaultSerializeError)(error),
        __isServerError: true,
      }
    })

  return promise
}
