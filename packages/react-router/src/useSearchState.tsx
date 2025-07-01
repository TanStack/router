import * as React from 'react'
import { useRouter } from './useRouter'
import { useSearch } from './useSearch'
import type {
  AnyRouter,
  ConstrainLiteral,
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
  TValue,
> = TStrict extends false
  ? {
      from?: never
      strict: TStrict
      key: AnyKey<TRouter, TKey>
      initial?: TValue
    }
  : {
      from: ValidateId<TRouter, TFrom>
      strict?: TStrict
      key: FromKey<TRouter, TFrom, TKey>
      initial?: TValue
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

export function useSearchState<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TStrict extends boolean = true,
  TKey extends string = string,
  TValue = ValueFrom<TRouter, TFrom, TStrict, TKey>,
>({
  from,
  strict,
  initial,
  key,
}: Params<TRouter, TFrom, TStrict, TKey, NoInfer<TValue>>): readonly [
  state: TValue,
  setState: (
    value: TValue | ((prev: TValue) => TValue),
    pushState?: boolean,
  ) => void,
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

  // initial value
  React.useLayoutEffect(() => {
    if (initial !== undefined && state === undefined) {
      setState(initial)
    }
  }, [])

  return [state, setState]
}

const getter = (key: string, state: object) =>
  // @ts-expect-error -- no need to strictly type this internal function
  state[key]

const store = Symbol('search accumulator')
const push = Symbol('push accumulator')
const scheduled = Symbol('microtask scheduled')

function setter<T>(
  router: AnyRouter & {
    [store]?: object | null
    [push]?: boolean | null
    [scheduled]?: boolean | null
  },
  key: string,
  value: T | ((prev: T) => T),
  pushState?: boolean,
) {
  const prev = router[store] || router.state.location.search
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

  /**
   * We temporarily store the search state in the router object
   * so that multiple calls to setState in the same tick will
   * accumulate changes in the same object instead of overwriting.
   *
   * We use a Symbol to avoid conflicts with other properties
   * that we don't own.
   */
  router[store] = next
  router[push] ||= pushState

  // a microtask is already scheduled in this tick, nothing else to do
  if (router[scheduled]) return
  router[scheduled] = true

  // if a call to `navigate()` happens in the same tick as this setter,
  // cancel the microtask and let the `navigate()` call handle the state update
  const unsub = router.subscribe(
    'onBeforeNavigate',
    () => (router[scheduled] = false),
  )

  // we use a microtask to allow for multiple synchronous calls to `setState`
  // to accumulate changes but still call `navigate()` only once
  queueMicrotask(() => {
    unsub()
    if (!router[scheduled]) return

    void router.navigate({
      hash: router.state.location.hash,
      replace: !router[push],
      search: router[store],
      to: router.state.location.pathname,
    })

    /**
     * After a tick, we nullify the property to avoid memory leaks,
     * and to ensure that the next setState call will start from
     * the current search state.
     */
    router[store] = null
    router[push] = null
    router[scheduled] = null
  })
}
