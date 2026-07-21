import * as React from 'react'
import {
  deepEqual,
  exactPathTest,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { useRouter, useRouterState } from '@tanstack/react-router/native'
import type {
  AnyRouter,
  LinkOptions,
  NavigateOptions,
  RegisteredRouter,
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from '@tanstack/react-router/native'

export interface NativeScriptActiveLinkOptions {
  activeClass?: string
  inactiveClass?: string
  activeStyle?: string | Record<string, unknown>
  inactiveStyle?: string | Record<string, unknown>
  activeOptions?: {
    exact?: boolean
    includeSearch?: boolean
    includeHash?: boolean
    explicitUndefined?: boolean
  }
}

export type NativeScriptLinkOptionsFnOptions<
  TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<unknown>
    ? ValidateLinkOptionsArray<TRouter, TOptions, string, 'contentview'>
    : ValidateLinkOptions<TRouter, TOptions, string, 'contentview'>

export type NativeScriptLinkOptionsFn = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: NativeScriptLinkOptionsFnOptions<TOptions, TRouter>,
) => TOptions

/** Type-check and reuse options for a NativeScript Link or navigation. */
export function linkOptions<
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(options: NativeScriptLinkOptionsFnOptions<TOptions, TRouter>): TOptions {
  return options as TOptions
}

export type NativeScriptLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  NativeScriptActiveLinkOptions & {
    children?:
      | React.ReactNode
      | ((state: {
          isActive: boolean
          isTransitioning: boolean
        }) => React.ReactNode)
    class?: string
    className?: string
    style?: string | Record<string, unknown>
    disabled?: boolean
    onTap?: (event: unknown) => void
    accessibilityLabel?: string
    [key: string]: unknown
  }

export function useNativeScriptLinkProps(props: NativeScriptLinkProps) {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = React.useState(false)
  const pendingNavigationCountRef = React.useRef(0)
  const { disabled, onTap: onTapProp } = props
  const navigationOptions = React.useMemo<NavigateOptions>(
    () => ({
      to: props.to,
      from: props.from,
      params: props.params,
      search: props.search,
      hash: props.hash,
      state: props.state,
      mask: props.mask,
      replace: props.replace,
      resetScroll: props.resetScroll,
      hashScrollIntoView: props.hashScrollIntoView,
      startTransition: props.startTransition,
      viewTransition: props.viewTransition,
      ignoreBlocker: props.ignoreBlocker,
      reloadDocument: props.reloadDocument,
      href: props.href,
      publicHref: props.publicHref,
      _fromLocation: props._fromLocation,
      unsafeRelative: props.unsafeRelative,
      stackBehavior: props.stackBehavior,
      stackMatch: props.stackMatch,
      entryId: props.entryId,
      native: props.native,
    }),
    [
      props._fromLocation,
      props.entryId,
      props.from,
      props.hash,
      props.hashScrollIntoView,
      props.href,
      props.ignoreBlocker,
      props.mask,
      props.native,
      props.params,
      props.publicHref,
      props.reloadDocument,
      props.replace,
      props.resetScroll,
      props.search,
      props.stackBehavior,
      props.stackMatch,
      props.startTransition,
      props.state,
      props.to,
      props.unsafeRelative,
      props.viewTransition,
    ],
  )
  const next = React.useMemo(
    () => router.buildLocation(navigationOptions),
    [navigationOptions, router],
  )
  const isActive = useRouterState({
    select: (state) => {
      const exact = props.activeOptions?.exact ?? false
      if (exact) {
        if (
          !exactPathTest(
            state.location.pathname,
            next.pathname,
            router.basepath,
          )
        ) {
          return false
        }
      } else {
        const currentPath = removeTrailingSlash(
          state.location.pathname,
          router.basepath,
        )
        const nextPath = removeTrailingSlash(next.pathname, router.basepath)
        if (
          !currentPath.startsWith(nextPath) ||
          (currentPath.length !== nextPath.length &&
            currentPath[nextPath.length] !== '/')
        ) {
          return false
        }
      }

      if (
        (props.activeOptions?.includeSearch ?? true) &&
        !deepEqual(state.location.search, next.search, {
          partial: !exact,
          ignoreUndefined: !props.activeOptions?.explicitUndefined,
        })
      ) {
        return false
      }

      return (
        !props.activeOptions?.includeHash || state.location.hash === next.hash
      )
    },
  })

  const onTap = React.useCallback(
    async (event: unknown) => {
      if (disabled) {
        return
      }
      onTapProp?.(event)
      if ((event as { defaultPrevented?: boolean }).defaultPrevented) {
        return
      }

      pendingNavigationCountRef.current += 1
      if (pendingNavigationCountRef.current === 1) {
        setIsTransitioning(true)
      }
      try {
        await router.navigate(navigationOptions)
      } finally {
        pendingNavigationCountRef.current -= 1
        if (pendingNavigationCountRef.current === 0) {
          setIsTransitioning(false)
        }
      }
    },
    [disabled, navigationOptions, onTapProp, router],
  )

  return {
    isActive,
    isTransitioning,
    onTap,
  }
}

/** A tap-driven, type-safe NativeScript Link. */
export function Link(props: NativeScriptLinkProps) {
  const link = useNativeScriptLinkProps(props)
  const {
    children,
    activeClass,
    inactiveClass,
    activeStyle,
    inactiveStyle,
    activeOptions: _activeOptions,
    to: _to,
    from: _from,
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    replace: _replace,
    resetScroll: _resetScroll,
    hashScrollIntoView: _hashScrollIntoView,
    startTransition: _startTransition,
    viewTransition: _viewTransition,
    ignoreBlocker: _ignoreBlocker,
    reloadDocument: _reloadDocument,
    href: _href,
    publicHref: _publicHref,
    _fromLocation,
    unsafeRelative: _unsafeRelative,
    stackBehavior: _stackBehavior,
    stackMatch: _stackMatch,
    entryId: _entryId,
    native: _native,
    target: _target,
    preload: _preload,
    preloadDelay: _preloadDelay,
    preloadIntentProximity: _preloadIntentProximity,
    class: classProp,
    className,
    style,
    onTap: _onTap,
    disabled,
    ...rest
  } = props
  const stateClass = link.isActive ? activeClass : inactiveClass
  const resolvedClass = [classProp ?? className, stateClass]
    .filter(Boolean)
    .join(' ')
  const stateStyle = link.isActive ? activeStyle : inactiveStyle
  const resolvedStyle =
    typeof style === 'object' && typeof stateStyle === 'object'
      ? { ...style, ...stateStyle }
      : (stateStyle ?? style)
  const content =
    typeof children === 'function'
      ? children({
          isActive: link.isActive,
          isTransitioning: link.isTransitioning,
        })
      : children

  const hostProps = {
    ...rest,
    class: resolvedClass || undefined,
    style: resolvedStyle,
    isUserInteractionEnabled: !disabled,
    onTap: link.onTap,
  }

  if (typeof content === 'string' || typeof content === 'number') {
    return React.createElement('label', {
      ...hostProps,
      text: String(content),
    })
  }

  return React.createElement('contentview', hostProps, content)
}
