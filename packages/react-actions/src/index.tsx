import * as React from 'react'
import { Action, ActionStore, ActionSubmission } from '@tanstack/actions'
import { useStore } from '@tanstack/react-store'

export * from '@tanstack/actions'

export function useAction<
  TKey extends string = string,
  TPayload = unknown,
  TResponse = unknown,
  TError = Error,
>(
  action: Action<TKey, TPayload, TResponse, TError>,
  opts?: {
    track?: (actionStore: ActionStore<TPayload, TResponse, TError>) => any
  },
): Action<TKey, TPayload, TResponse, TError> &
  Action<TKey, TPayload, TResponse, TError>['store']['state'] & {
    latestSubmission: ActionSubmission<TPayload, TResponse, TError>
    pendingSubmissions: ActionSubmission<TPayload, TResponse, TError>[]
  } {
  useStore(action.store, (d) => opts?.track?.(d) ?? d, true)

  const [ref] = React.useState({})

  Object.assign(ref, {
    ...action,
    latestSubmission:
      action.store.state.submissions[action.store.state.submissions.length - 1],
    pendingSubmissions: React.useMemo(
      () =>
        action.store.state.submissions.filter((d) => d.status === 'pending'),
      [action.store.state.submissions],
    ),
  })

  return ref as any
}
