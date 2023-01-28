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
  const allOpts = opts as typeof opts & {
    action?: Action<any, any, any, any>
    key?: TKey
  }

  const actionClient = React.useContext(actionClientContext)

  const action = allOpts.action ?? actionClient.getAction({ key: allOpts.key })

  useStore(action.store, (d) => allOpts?.track?.(d as any) ?? d, true)

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

  useStore(actionClient.store, (d) => opts?.track?.(d as any) ?? d, true)

  return actionClient
}
