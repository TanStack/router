import * as React from 'react'
import {
  Action,
  ActionByKey,
  ActionClient,
  ActionClientStore,
  ActionStore,
  ActionSubmission,
  RegisteredActions,
} from '@tanstack/actions'
import { useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'

export * from '@tanstack/actions'

const actionClientContext = React.createContext<ActionClient<any>>(null as any)

export function ActionClientProvider(props: {
  actionClient: ActionClient<any>
  children: any
}) {
  return (
    <actionClientContext.Provider value={props.actionClient}>
      {props.children}
    </actionClientContext.Provider>
  )
}

export function useAction<
  TKey extends string,
  TAction extends ActionByKey<RegisteredActions, TKey>,
  TPayload = TAction['__types']['payload'],
  TResponse = TAction['__types']['response'],
  TError = TAction['__types']['error'],
>(opts: {
  key: TKey
  track?: (actionStore: ActionStore<TPayload, TResponse, TError>) => any
}): [
  Action<TKey, TPayload, TResponse, TError>['store']['state'] & {
    latestSubmission: ActionSubmission<TPayload, TResponse, TError>
    pendingSubmissions: ActionSubmission<TPayload, TResponse, TError>[]
  },
  Action<TKey, TPayload, TResponse, TError>,
] {
  const actionClient = React.useContext(actionClientContext)
  const action = actionClient.getAction({ key: opts.key })

  useStore(action.store, (d) => opts?.track?.(d as any) ?? d, true)

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

export function useActionClient(opts?: {
  track?: (actionClientStore: ActionClientStore) => any
}): [ActionClientStore['state'], ActionClient<RegisteredActions>] {
  const actionClient = React.useContext(actionClientContext)

  if (!actionClient)
    invariant(
      'useActionClient must be used inside a <ActionClientProvider> component!',
    )

  useStore(actionClient.store, (d) => opts?.track?.(d as any) ?? d, true)

  return [actionClient.store.state as any, actionClient as any]
}
