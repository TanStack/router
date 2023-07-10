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
  TKey extends keyof RegisteredActions,
  TAction,
  TActionFromKey extends ActionByKey<RegisteredActions, TKey>,
  TResolvedAction extends unknown extends TAction
    ? TActionFromKey
    : TAction extends Action<any, any, any, any>
    ? TAction
    : never,
  TPayload extends TResolvedAction['__types']['payload'],
  TResponse extends TResolvedAction['__types']['response'],
  TError extends TResolvedAction['__types']['error'],
>(
  opts: (
    | {
        key: TKey
      }
    | { action: TAction }
  ) & {
    track?: (actionStore: ActionStore<TPayload, TResponse, TError>) => any
  },
): TResolvedAction {
  const actionClient = React.useContext(actionClientContext)

  const optsKey = (opts as { key: string }).key
  const optsAction = (opts as { action: any }).action
  const action = optsAction ?? actionClient.actions[optsKey]
  useStore(action.__store, (d) => opts?.track?.(d as any) ?? d)
  return action as any
}

export function useActionClient(opts?: {
  track?: (actionClientStore: ActionClientStore) => any
}): ActionClient<RegisteredActions> {
  const actionClient = React.useContext(actionClientContext)

  if (!actionClient)
    invariant(
      'useActionClient must be used inside a <ActionClientProvider> component!',
    )

  useStore(actionClient.__store, (d) => opts?.track?.(d as any) ?? d)

  return actionClient
}
