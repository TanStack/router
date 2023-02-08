import {
  Action,
  ActionByKey,
  ActionClient,
  ActionClientStore,
  ActionStore,
  RegisteredActions,
} from '@tanstack/actions'
import { useStore } from '@tanstack/solid-store'
import { createContext, createRenderEffect, useContext } from 'solid-js'
import invariant from 'tiny-invariant'

export * from '@tanstack/actions'

const actionClientContext = createContext<ActionClient<any>>(null as any)

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

  const actionClient = useContext(actionClientContext)

  if (!actionClient) {
    invariant(
      'useActionClient must be used inside a <ActionClientProvider> component!',
    )
  }

  const action = allOpts.action ?? actionClient!.getAction({ key: allOpts.key })

  const actionCopy = { ...action }

  const state = useStore(action.store, (s) => allOpts?.track?.(s) ?? s)

  createRenderEffect(() => {
    Object.assign(actionCopy, action, { state })
  })

  return actionCopy as any
}

export function useActionClient(opts?: {
  track?: (actionClientStore: ActionClientStore) => any
}): ActionClient<RegisteredActions> {
  const actionClient = useContext(actionClientContext)

  if (!actionClient)
    invariant(
      'useActionClient must be used inside a <ActionClientProvider> component!',
    )

  const actionClientCopy = { ...actionClient }

  const state = useStore(
    actionClient!.store,
    (s) => opts?.track?.(s as any) ?? s,
  )

  createRenderEffect(() => {
    Object.assign(actionClientCopy, actionClient, { state })
  })

  return actionClientCopy as any
}
