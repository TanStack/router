import { defaultSerializeError } from './router'

export type DeferredPromiseState<T> = {
  uid: string
  resolve?: () => void
  reject?: () => void
} & (
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
)

export type DeferredPromise<T> = Promise<T> & DeferredPromiseState<T>

export function defer<T>(
  _promise: Promise<T>,
  options?: {
    serializeError?: typeof defaultSerializeError
  },
) {
  const promise = _promise as DeferredPromise<T>

  if (!(promise as any).status) {
    Object.assign(promise, {
      status: 'pending',
    })

    promise
      .then((data) => {
        promise.status = 'success' as any
        promise.data = data
      })
      .catch((error) => {
        promise.status = 'error' as any
        ;(promise as any).error = {
          data: (options?.serializeError ?? defaultSerializeError)(error),
          __isServerError: true,
        }
      })
  }

  return promise
}
