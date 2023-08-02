import * as React from 'react'
import {
  ActionClient,
  ActionClientState,
  ActionClientStore,
  ActionState,
  RegisteredActions,
  RegisteredActionsByKey,
} from '@tanstack/actions'
import { useStore } from '@tanstack/react-store'
import invariant from 'tiny-invariant'

export * from '@tanstack/actions'

const actionsContext = React.createContext<{
  client: ActionClient<any, any, any>
}>(null as any)

export function ActionClientProvider(props: {
  client: ActionClient<any, any, any>
  children: any
}) {
  return (
    <actionsContext.Provider value={{ client: props.client }}>
      {props.children}
    </actionsContext.Provider>
  )
}

export function useAction<
  TKey extends keyof RegisteredActionsByKey,
  TAction extends RegisteredActionsByKey[TKey] = RegisteredActionsByKey[TKey],
  TSelected = ActionState<
    TAction['__types']['key'],
    TAction['__types']['variables'],
    TAction['__types']['response'],
    TAction['__types']['error']
  >,
>(opts: {
  key: TKey
  select?: (
    state: ActionState<
      TAction['__types']['key'],
      TAction['__types']['variables'],
      TAction['__types']['response'],
      TAction['__types']['error']
    >,
  ) => TSelected
}): [state: TSelected, client: ActionClient<RegisteredActions>] {
  const ctx = React.useContext(actionsContext)

  invariant(
    ctx,
    'useAction must be used inside a <ActionClientProvider> component!',
  )

  const { client } = ctx

  return [
    useStore(client.__store, (d) => {
      const action = d.actions[opts.key]
      return opts.select?.(action as any) ?? action
    }) as TSelected,
    client,
  ]
}

export function useActionClient(opts?: {
  track?: (clientStore: ActionClientStore) => any
}): ActionClient<RegisteredActions> {
  const ctx = React.useContext(actionsContext)

  invariant(
    ctx,
    'useAction must be used inside a <ActionClientProvider> component!',
  )

  useStore(ctx.client.__store, (d) => opts?.track?.(d as any) ?? d)

  return ctx.client
}
