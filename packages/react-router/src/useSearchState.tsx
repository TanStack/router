import * as React from 'react'
import { useRouter } from './useRouter'
import { useSearch } from './useSearch'
import type {
  AnyRouter,
  ConstrainLiteral,
  NavigateOptions, // It would be better to use `NavigateOptionProps` instead, but it is not exported from the core package
  RegisteredRouter,
  ValidateId,
} from '@tanstack/router-core'

type SearchSchema<
  TRouter extends AnyRouter,
  TFrom extends keyof TRouter['routesById'],
> = keyof TRouter['routesById'][TFrom]['types']['searchSchema']

type AnyKey<TRouter extends AnyRouter, TKey extends string> = ConstrainLiteral<
  TKey,
  string &
    {
      [K in keyof TRouter['routesById']]: SearchSchema<TRouter, K>
    }[keyof TRouter['routesById']]
>

type FromKey<
  TRouter extends AnyRouter,
  TFrom extends string,
  TKey extends string,
> = ConstrainLiteral<
  TKey,
  string & SearchSchema<TRouter, TFrom & keyof TRouter['routesById']>
>

type Params<
  TRouter extends AnyRouter,
  TFrom extends string,
  TStrict extends boolean,
  TKey extends string,
> =
  | {
      from?: never
      strict: TStrict & false
      key: AnyKey<TRouter, TKey>
    }
  | {
      from: ValidateId<TRouter, TFrom>
      strict?: TStrict & true
      key: FromKey<TRouter, TFrom, TKey>
    }

type ValueFrom<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TKey extends string,
> = TStrict extends false
  ?
      | undefined
      | {
          [K in keyof TRouter['routesById']]: TKey extends keyof TRouter['routesById'][K]['types']['searchSchema']
            ? TRouter['routesById'][K]['types']['searchSchema'][TKey]
            : never
        }[keyof TRouter['routesById']]
  : TRouter['routesById'][TFrom &
      keyof TRouter['routesById']]['types']['searchSchema'][TKey]

type SetSearchStateOptions = Pick<
  NavigateOptions,
  | 'hashScrollIntoView'
  | 'reloadDocument'
  | 'replace'
  | 'ignoreBlocker'
  | 'resetScroll'
  | 'viewTransition'
>

type SetSearchState<TValue> = (
  value: TValue | ((prev: TValue) => TValue),
  options?: SetSearchStateOptions,
) => void

export function useSearchState<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TStrict extends boolean = true,
  TKey extends string = string,
  TValue = ValueFrom<TRouter, TFrom, TStrict, TKey>,
>({
  from,
  strict,
  key,
}: Params<TRouter, TFrom, TStrict, TKey>): readonly [
  state: TValue,
  setState: SetSearchState<TValue>,
] {
  // state
  const state = useSearch(
    React.useMemo(
      () => ({
        from,
        select: getter.bind(null, key),
        strict,
      }),
      [key, from, strict],
    ),
  ) as TValue

  // setState
  const router = useRouter()
  const setState = React.useMemo(
    () => (setter<TValue>).bind(null, router, key),
    [router, key],
  )

  return [state, setState]
}

const getter = (key: string, state: object) =>
  // @ts-expect-error -- no need to strictly type this internal function
  state[key]

/**
 * We temporarily store the search state so that multiple calls
 * to setState in the same tick will accumulate changes instead
 * of overwriting them.
 *
 * We use a WeakMap to support potentially multiple routers
 * in the same app, and to avoid memory leaks.
 */
const routerStore = new WeakMap<
  AnyRouter,
  {
    search: object | null
    opts: SetSearchStateOptions | null
    scheduled: boolean | null
  }
>()

function setter<T>(
  router: AnyRouter,
  key: string,
  value: T | ((prev: T) => T),
  options?: SetSearchStateOptions,
) {
  let store = routerStore.get(router)
  const prev = store?.search || router.state.location.search
  const next = {
    ...prev,
    [key]:
      typeof value === 'function'
        ? // @ts-expect-error -- no need to strictly type this internal function
          value(prev[key])
        : value,
  }

  // this `setState` did not change the search state,
  // so we don't need to navigate
  if (next[key] === prev[key]) return

  // create a store for this router if it's the first time
  if (!store) {
    store = {
      search: null,
      opts: null,
      scheduled: null,
    }
    routerStore.set(router, store)
  }

  // accumulate changes in the store
  store.search = next
  if (options) {
    const current = store.opts
    if (current) {
      current.hashScrollIntoView ||= options.hashScrollIntoView
      current.reloadDocument ||= options.reloadDocument
      current.replace = current.replace === false ? false : options.replace
      current.ignoreBlocker ||= options.ignoreBlocker
      current.resetScroll ||= options.resetScroll
      current.viewTransition ||= options.viewTransition
    } else {
      store.opts = options
    }
  }

  // a microtask is already scheduled in this tick, nothing else to do
  if (store.scheduled) return
  store.scheduled = true

  // if a call to `navigate()` happens in the same tick as this setter,
  // cancel the microtask and let the `navigate()` call handle the state update
  const clear = router.subscribe(
    'onBeforeNavigate',
    () => (store.scheduled = false),
  )

  // we use a microtask to allow for multiple synchronous calls to `setState`
  // to accumulate changes but still call `navigate()` only once
  queueMicrotask(() => {
    clear()
    if (!store.scheduled) return

    const options = store.opts

    void router.navigate({
      ...store.opts,
      hash: router.state.location.hash,
      search: store.search,
      to: router.state.location.pathname,
      replace: options?.replace !== false,
    })

    /**
     * After a tick, we nullify the property to avoid memory leaks,
     * and to ensure that the next setState call will start from
     * the current search state.
     */
    store.search = null
    store.opts = null
    store.scheduled = null
  })
}
