import * as React from 'react'

export type AwaitOptions<T> = {
  promise: Promise<T>
}

type AwaitedState<T> =
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

export function useAwait<T>(options: AwaitOptions<T>): [T] {
  const promise = options.promise as Promise<T> & {
    __awaitedState: AwaitedState<T>
  }

  if (!promise.__awaitedState) {
    console.log('initializing')
    promise.__awaitedState = {
      status: 'pending',
    }
  }

  const { __awaitedState: state } = promise

  if (state.status === 'pending') {
    throw options.promise
      .then((data) => {
        state.status = 'success' as any
        state.data = data
      })
      .catch((error) => {
        state.status = 'error' as any
        state.error = error
      })
  }

  if (state.status === 'error') {
    throw state.error
  }

  return [state.data]
}

export function Await<T>(
  props: AwaitOptions<T> & {
    children: (result: T) => JSX.Element
  },
) {
  const awaited = useAwait(props)
  return props.children(...awaited)
}
