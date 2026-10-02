'use client'

import * as React from 'react'
import { trimPathRight } from '@tanstack/router-core'
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
  replace: boolean
  state: HistoryState
}

function isEqualArrayBuffer(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) {
    return false
  }

  const aBytes = new Uint8Array(a)
  const bBytes = new Uint8Array(b)
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] !== bBytes[i]) {
      return false
    }
  }

  return true
}

function isEqualArrayBufferView(a: ArrayBufferView, b: ArrayBufferView) {
  if (a.byteLength !== b.byteLength) {
    return false
  }

  const aBytes = new Uint8Array(
    a.buffer as ArrayBuffer,
    a.byteOffset,
    a.byteLength,
  )
  const bBytes = new Uint8Array(
    b.buffer as ArrayBuffer,
    b.byteOffset,
    b.byteLength,
  )
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] !== bBytes[i]) {
      return false
    }
  }

  return true
}

function hasSeenPair(
  seen: WeakMap<object, WeakSet<object>>,
  a: object,
  b: object,
) {
  const paired = seen.get(a)
  if (paired?.has(b)) {
    return true
  }

  if (paired) {
    paired.add(b)
  } else {
    seen.set(a, new WeakSet([b]))
  }

  return false
}

function isEqualHistoryState(
  a: unknown,
  b: unknown,
  seen = new WeakMap<object, WeakSet<object>>(),
): boolean {
  if (Object.is(a, b)) {
    return true
  }

  if (
    a === null ||
    b === null ||
    typeof a !== 'object' ||
    typeof b !== 'object'
  ) {
    return false
  }

  if (hasSeenPair(seen, a, b)) {
    return true
  }

  const aTag = Object.prototype.toString.call(a)
  if (aTag !== Object.prototype.toString.call(b)) {
    return false
  }

  if (a instanceof Date && b instanceof Date) {
    return Object.is(a.getTime(), b.getTime())
  }

  if (a instanceof RegExp && b instanceof RegExp) {
    return a.source === b.source && a.flags === b.flags
  }

  if (a instanceof ArrayBuffer && b instanceof ArrayBuffer) {
    return isEqualArrayBuffer(a, b)
  }

  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b)) {
    return isEqualArrayBufferView(a, b)
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false
    }

    for (let i = 0; i < a.length; i++) {
      if (!isEqualHistoryState(a[i], b[i], seen)) {
        return false
      }
    }

    return true
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) {
      return false
    }

    const bEntries = Array.from(b.entries())
    let index = 0
    for (const [aKey, aValue] of a.entries()) {
      const [bKey, bValue] = bEntries[index++]!
      if (
        !isEqualHistoryState(aKey, bKey, seen) ||
        !isEqualHistoryState(aValue, bValue, seen)
      ) {
        return false
      }
    }

    return true
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) {
      return false
    }

    const bValues = Array.from(b.values())
    let index = 0
    for (const aValue of a.values()) {
      if (!isEqualHistoryState(aValue, bValues[index++], seen)) {
        return false
      }
    }

    return true
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }

  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false
    }

    if (
      !isEqualHistoryState(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
        seen,
      )
    ) {
      return false
    }
  }

  return true
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
  const {
    hashScrollIntoView: _hashScrollIntoView,
    href,
    ignoreBlocker: _ignoreBlocker,
    reloadDocument: _reloadDocument,
    replace,
    resetScroll: _resetScroll,
    startTransition: _startTransition,
    viewTransition: _viewTransition,
    ...toOptions
  } = props

  const next = router.buildLocation({
    ...toOptions,
    _includeValidateSearch: true,
  } as Parameters<typeof router.buildLocation>[0])

  return {
    href: trimPathRight(href || next.href),
    replace: replace ?? false,
    state: getUserHistoryState(next.state),
  }
}

function isSameNavigateLocationKey(
  a: NavigateLocationKey,
  b: NavigateLocationKey,
) {
  return (
    a.href === b.href &&
    a.replace === b.replace &&
    isEqualHistoryState(a.state, b.state)
  )
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
