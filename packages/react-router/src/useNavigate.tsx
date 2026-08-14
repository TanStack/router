'use client'

import * as React from 'react'
import { deepEqual, trimPathRight } from '@tanstack/router-core'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'
import type { HistoryState, ParsedHistoryState } from '@tanstack/history'

type NavigateLocationKey = {
  href: string
  state: HistoryState
}

function getUserHistoryState({
  key: _key,
  __TSR_key: _tsrKey,
  __TSR_index: _tsrIndex,
  __hashScrollIntoViewOptions: _hashScroll,
  ...state
}: ParsedHistoryState): HistoryState {
  return state
}

function getNavigateLocationKey<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  router: TRouter,
  props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): NavigateLocationKey {
  const next = router.buildLocation({
    ...(props as any),
    _includeValidateSearch: true,
  })

  return {
    href: trimPathRight(next.href),
    state: getUserHistoryState(next.state),
  }
}

function isSameNavigateLocationKey(
  a: NavigateLocationKey,
  b: NavigateLocationKey,
) {
  return a.href === b.href && deepEqual(a.state, b.state)
}

/**
 * Imperative navigation hook.
 *
 * Returns a stable `navigate(options)` function to change the current location
 * programmatically. Prefer the `Link` component for user-initiated navigation,
 * and use this hook from effects, callbacks, or handlers where imperative
 * navigation is required.
 *
 * Options:
 * - `from`: Optional route base used to resolve relative `to` paths.
 *
 * @returns A function that accepts `NavigateOptions`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useNavigateHook
 */
export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(_defaultOpts?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom> {
  const router = useRouter()

  return React.useCallback(
    (options: NavigateOptions) => {
      return router.navigate({
        ...options,
        from: options.from ?? _defaultOpts?.from,
      })
    },
    [_defaultOpts?.from, router],
  ) as UseNavigateResult<TDefaultFrom>
}

/**
 * Component that triggers a navigation when rendered. Navigation executes
 * in an effect after mount/update.
 *
 * Props are the same as `NavigateOptions` used by `navigate()`.
 *
 * @returns null
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/navigateComponent
 */
export function Navigate<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(props: NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>): null {
  const router = useRouter<TRouter>()
  const navigate = useNavigate<TRouter>()

  const previousLocationKeyRef = React.useRef<NavigateLocationKey | null>(null)
  useLayoutEffect(() => {
    const nextLocationKey = getNavigateLocationKey(router, props)

    if (
      previousLocationKeyRef.current === null ||
      !isSameNavigateLocationKey(
        previousLocationKeyRef.current,
        nextLocationKey,
      )
    ) {
      previousLocationKeyRef.current = nextLocationKey
      navigate(props)
    }
  }, [router, props, navigate])
  return null
}
