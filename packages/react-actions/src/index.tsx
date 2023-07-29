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
  state: ActionClientState
}>(null as any)

const useLayoutEffect =
  typeof document !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function ActionClientProvider(props: {
  client: ActionClient<any, any, any>
  children: any
}) {
  const [state, _setState] = React.useState(() => props.client.state)

  useLayoutEffect(() => {
    return props.client.__store.subscribe(() => {
      ;(React.startTransition || ((d) => d()))(() =>
        _setState(props.client.state),
      )
    })
  }, [])

  return (
    <actionsContext.Provider value={{ client: props.client, state }}>
      {props.children}
    </actionsContext.Provider>
  )
}

export function useAction<
  TKey extends keyof RegisteredActionsByKey,
  TAction extends RegisteredActionsByKey[TKey] = RegisteredActionsByKey[TKey],
>(opts: {
  key: TKey
}): [
  state: ActionState<
    TAction['__types']['key'],
    TAction['__types']['variables'],
    TAction['__types']['response'],
    TAction['__types']['error']
  >,
  client: ActionClient<RegisteredActions>,
] {
  const ctx = React.useContext(actionsContext)

  invariant(
    ctx,
    'useAction must be used inside a <ActionClientProvider> component!',
  )

  const { client, state } = ctx

  const action = state.actions[opts.key]

  return [action as any, client]
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
