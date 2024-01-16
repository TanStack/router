import { defaultSerializeError } from './router'

export type DeferredPromiseState<T> = { uid: string } & (
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

export type DeferredPromise<T> = Promise<T> & {
  __deferredState: DeferredPromiseState<T>
}

export function defer<T>(
  _promise: Promise<T>,
  options?: {
    serializeError?: typeof defaultSerializeError
  },
) {
  const promise = _promise as DeferredPromise<T>

  if (!promise.__deferredState) {
    promise.__deferredState = {
      uid: Math.random().toString(36).slice(2),
      status: 'pending',
    }

    const state = promise.__deferredState

    promise
      .then((data) => {
        state.status = 'success' as any
        state.data = data
      })
      .catch((error) => {
        state.status = 'error' as any
        state.error = (options?.serializeError ?? defaultSerializeError)(error)
      })
  }

  return promise
}

export function isDehydratedDeferred(obj: any): boolean {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    !(obj instanceof Promise) &&
    !obj.then &&
    '__deferredState' in obj
  )
}
