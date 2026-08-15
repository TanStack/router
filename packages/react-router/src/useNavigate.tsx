'use client'

import * as React from 'react'
import { useLayoutEffect } from './utils'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  FromPathOption,
  NavigateOptions,
  RegisteredRouter,
  UseNavigateResult,
} from '@tanstack/router-core'

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
  const router = useRouter()
  const navigate = useNavigate()

  // Guard on the resolved destination rather than on the props object.
  //
  // React allocates a fresh props object on every render, so an identity check
  // never holds and the navigation is re-issued on every render. That is only
  // observable when this component re-renders while the navigation is still
  // pending - each re-issue supersedes the in-flight navigation before it can
  // settle, so it never commits and the app is stuck on a loading state.
  //
  // A value comparison of `props` is not enough either: `search` and `params`
  // accept updater functions, which are usually declared inline and so are also
  // fresh on every render. Resolving the location collapses those to a concrete
  // href. `Link` already builds the location on every render, so this is a cost
  // the router is used to paying.
  const href = router.buildLocation(props as any).href

  const previousHrefRef = React.useRef<string | null>(null)

  useLayoutEffect(() => {
    if (previousHrefRef.current !== href) {
      previousHrefRef.current = href
      navigate(props)
    }
    // `props` is intentionally omitted: it is a fresh object on every render,
    // and `href` is what determines whether the destination actually changed.
    // Closing over `props` from the committed render keeps the options that are
    // not part of the href, such as `replace`, consistent with that href.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [href, navigate])
  return null
}
