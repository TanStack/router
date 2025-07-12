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

const store = Symbol('search accumulator')
const opts = Symbol('options accumulator')
const scheduled = Symbol('microtask scheduled')

function setter<T>(
  router: AnyRouter & {
    [store]?: object | null
    [opts]?: SetSearchStateOptions | null
    [scheduled]?: boolean | null
  },
  key: string,
  value: T | ((prev: T) => T),
  options?: SetSearchStateOptions,
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
  if (options) {
    const current = router[opts]
    if (current) {
      current.hashScrollIntoView ||= options.hashScrollIntoView
      current.reloadDocument ||= options.reloadDocument
      current.replace = current.replace === false ? false : options.replace
      current.ignoreBlocker ||= options.ignoreBlocker
      current.resetScroll ||= options.resetScroll
      current.viewTransition ||= options.viewTransition
    } else {
      router[opts] = options
    }
  }

  // a microtask is already scheduled in this tick, nothing else to do
  if (router[scheduled]) return
  router[scheduled] = true

  // if a call to `navigate()` happens in the same tick as this setter,
  // cancel the microtask and let the `navigate()` call handle the state update
  const clear = router.subscribe(
    'onBeforeNavigate',
    () => (router[scheduled] = false),
  )

  // we use a microtask to allow for multiple synchronous calls to `setState`
  // to accumulate changes but still call `navigate()` only once
  queueMicrotask(() => {
    clear()
    if (!router[scheduled]) return

    const options = router[opts]

    void router.navigate({
      ...router[opts],
      hash: router.state.location.hash,
      search: router[store],
      to: router.state.location.pathname,
      replace: options?.replace !== false,
    })

    /**
     * After a tick, we nullify the property to avoid memory leaks,
     * and to ensure that the next setState call will start from
     * the current search state.
     */
    router[store] = null
    router[opts] = null
    router[scheduled] = null
  })
}
