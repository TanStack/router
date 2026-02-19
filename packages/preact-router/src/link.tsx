import { h } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'

import { useIntersectionObserver } from './utils'

import { useHydrated } from './ClientOnly'
import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type { ComponentChildren, RefObject, VNode } from 'preact'
import type { JSX } from 'preact/jsx-runtime'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

/**
 * Build anchor-like props for declarative navigation and preloading.
 */
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  forwardedRef?: RefObject<Element>,
): any {
  const router = useRouter()
  const innerRef = useRef<Element>(null) as RefObject<any>
  const resolvedRef = forwardedRef ?? innerRef

  const _isServer = isServer ?? router.isServer

  const {
    // custom props
    activeProps,
    inactiveProps,
    activeOptions,
    to,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    hashScrollIntoView,
    replace,
    startTransition,
    resetScroll,
    viewTransition,
    // element props
    children,
    target,
    disabled,
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ignoreBlocker,
    // prevent these from being returned
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    reloadDocument: _reloadDocument,
    unsafeRelative: _unsafeRelative,
    from: _from,
    _fromLocation,
    ...propsSafeToSpread
  } = options

  // SERVER EARLY RETURN
  if (_isServer) {
    const safeInternal = isSafeInternal(to)

    if (
      typeof to === 'string' &&
      !safeInternal &&
      to.indexOf(':') > -1
    ) {
      try {
        new URL(to)
        if (isDangerousProtocol(to, router.protocolAllowlist)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked Link with dangerous protocol: ${to}`)
          }
          return {
            ...propsSafeToSpread,
            ref: resolvedRef,
            href: undefined,
            ...(children && { children }),
            ...(target && { target }),
            ...(disabled && { disabled }),
            ...(style && { style }),
            ...(className && { className }),
          }
        }

        return {
          ...propsSafeToSpread,
          ref: resolvedRef,
          href: to,
          ...(children && { children }),
          ...(target && { target }),
          ...(disabled && { disabled }),
          ...(style && { style }),
          ...(className && { className }),
        }
      } catch {
        // Not an absolute URL
      }
    }

    const next = router.buildLocation({ ...options, from: options.from } as any)

    const hrefOptionPublicHref = next.maskedLocation
      ? next.maskedLocation.publicHref
      : next.publicHref
    const hrefOptionExternal = next.maskedLocation
      ? next.maskedLocation.external
      : next.external
    const hrefOption = getHrefOption(
      hrefOptionPublicHref,
      hrefOptionExternal,
      router.history,
      disabled,
    )

    const externalLink = (() => {
      if (hrefOption?.external) {
        if (isDangerousProtocol(hrefOption.href, router.protocolAllowlist)) {
          return undefined
        }
        return hrefOption.href
      }

      if (safeInternal) return undefined

      if (typeof to === 'string' && to.indexOf(':') > -1) {
        try {
          new URL(to)
          if (isDangerousProtocol(to, router.protocolAllowlist)) {
            return undefined
          }
          return to
        } catch {}
      }

      return undefined
    })()

    const isActive = (() => {
      if (externalLink) return false

      const currentLocation = router.state.location
      const exact = activeOptions?.exact ?? false

      if (exact) {
        const testExact = exactPathTest(
          currentLocation.pathname,
          next.pathname,
          router.basepath,
        )
        if (!testExact) return false
      } else {
        const currentPathSplit = removeTrailingSlash(
          currentLocation.pathname,
          router.basepath,
        )
        const nextPathSplit = removeTrailingSlash(
          next.pathname,
          router.basepath,
        )

        const pathIsFuzzyEqual =
          currentPathSplit.startsWith(nextPathSplit) &&
          (currentPathSplit.length === nextPathSplit.length ||
            currentPathSplit[nextPathSplit.length] === '/')

        if (!pathIsFuzzyEqual) return false
      }

      const includeSearch = activeOptions?.includeSearch ?? true
      if (includeSearch) {
        if (currentLocation.search !== next.search) {
          const currentSearchEmpty =
            !currentLocation.search ||
            (typeof currentLocation.search === 'object' &&
              Object.keys(currentLocation.search).length === 0)
          const nextSearchEmpty =
            !next.search ||
            (typeof next.search === 'object' &&
              Object.keys(next.search).length === 0)

          if (!(currentSearchEmpty && nextSearchEmpty)) {
            const searchTest = deepEqual(currentLocation.search, next.search, {
              partial: !exact,
              ignoreUndefined: !activeOptions?.explicitUndefined,
            })
            if (!searchTest) return false
          }
        }
      }

      if (activeOptions?.includeHash) return false
      return true
    })()

    if (externalLink) {
      return {
        ...propsSafeToSpread,
        ref: resolvedRef,
        href: externalLink,
        ...(children && { children }),
        ...(target && { target }),
        ...(disabled && { disabled }),
        ...(style && { style }),
        ...(className && { className }),
      }
    }

    const resolvedActiveProps: any =
      isActive
        ? (functionalUpdate(activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
        : STATIC_EMPTY_OBJECT

    const resolvedInactiveProps: any =
      isActive
        ? STATIC_EMPTY_OBJECT
        : (functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT)

    const resolvedStyle = (() => {
      const baseStyle = style
      const activeStyle = resolvedActiveProps.style
      const inactiveStyle = resolvedInactiveProps.style

      if (!baseStyle && !activeStyle && !inactiveStyle) return undefined
      if (baseStyle && !activeStyle && !inactiveStyle) return baseStyle
      if (!baseStyle && activeStyle && !inactiveStyle) return activeStyle
      if (!baseStyle && !activeStyle && inactiveStyle) return inactiveStyle

      return {
        ...(baseStyle as any),
        ...(activeStyle),
        ...(inactiveStyle),
      }
    })()

    const resolvedClassName = (() => {
      const baseClassName = className
      const activeClassName = resolvedActiveProps.className
      const inactiveClassName = resolvedInactiveProps.className

      if (!baseClassName && !activeClassName && !inactiveClassName) return ''

      let out = ''
      if (baseClassName) out = baseClassName as string
      if (activeClassName) out = out ? `${out} ${activeClassName}` : activeClassName
      if (inactiveClassName) out = out ? `${out} ${inactiveClassName}` : inactiveClassName
      return out
    })()

    return {
      ...propsSafeToSpread,
      ...resolvedActiveProps,
      ...resolvedInactiveProps,
      href: hrefOption?.href,
      ref: resolvedRef,
      disabled: !!disabled,
      target,
      ...(resolvedStyle && { style: resolvedStyle }),
      ...(resolvedClassName && { className: resolvedClassName }),
      ...(disabled && STATIC_DISABLED_PROPS),
      ...(isActive && STATIC_ACTIVE_PROPS),
    }
  }

  // CLIENT-ONLY CODE
  const isHydrated = useHydrated()

  const currentSearch = useRouterState({
    select: (s) => s.location.search,
    structuralSharing: true as any,
  })

  const from = options.from

  const _options = useMemo(
    () => {
      return { ...options, from }
    },
    [
      router,
      currentSearch,
      from,
      options._fromLocation,
      options.hash,
      options.to,
      options.search,
      options.params,
      options.state,
      options.mask,
      options.unsafeRelative,
    ],
  )

  const next = useMemo(
    () => router.buildLocation({ ..._options } as any),
    [router, _options],
  )

  const hrefOptionPublicHref = next.maskedLocation
    ? next.maskedLocation.publicHref
    : next.publicHref
  const hrefOptionExternal = next.maskedLocation
    ? next.maskedLocation.external
    : next.external
  const hrefOption = useMemo(
    () =>
      getHrefOption(
        hrefOptionPublicHref,
        hrefOptionExternal,
        router.history,
        disabled,
      ),
    [disabled, hrefOptionExternal, hrefOptionPublicHref, router.history],
  )

  const externalLink = useMemo(() => {
    if (hrefOption?.external) {
      if (isDangerousProtocol(hrefOption.href, router.protocolAllowlist)) {
        return undefined
      }
      return hrefOption.href
    }
    const safeInternal = isSafeInternal(to)
    if (safeInternal) return undefined
    if (typeof to !== 'string' || to.indexOf(':') === -1) return undefined
    try {
      new URL(to as any)
      if (isDangerousProtocol(to, router.protocolAllowlist)) {
        return undefined
      }
      return to
    } catch {}
    return undefined
  }, [to, hrefOption, router.protocolAllowlist])

  const isActive = useRouterState({
    select: (s) => {
      if (externalLink) return false
      if (activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next.pathname,
          router.basepath,
        )
        if (!testExact) return false
      } else {
        const currentPathSplit = removeTrailingSlash(
          s.location.pathname,
          router.basepath,
        )
        const nextPathSplit = removeTrailingSlash(
          next.pathname,
          router.basepath,
        )

        const pathIsFuzzyEqual =
          currentPathSplit.startsWith(nextPathSplit) &&
          (currentPathSplit.length === nextPathSplit.length ||
            currentPathSplit[nextPathSplit.length] === '/')

        if (!pathIsFuzzyEqual) return false
      }

      if (activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.search, {
          partial: !activeOptions?.exact,
          ignoreUndefined: !activeOptions?.explicitUndefined,
        })
        if (!searchTest) return false
      }

      if (activeOptions?.includeHash) {
        return isHydrated && s.location.hash === next.hash
      }
      return true
    },
  })

  const resolvedActiveProps: any = isActive
    ? (functionalUpdate(activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
    : STATIC_EMPTY_OBJECT

  const resolvedInactiveProps: any =
    isActive
      ? STATIC_EMPTY_OBJECT
      : (functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT)

  const resolvedClassName = [
    className,
    resolvedActiveProps.className,
    resolvedInactiveProps.className,
  ]
    .filter(Boolean)
    .join(' ')

  const resolvedStyle = (style ||
    resolvedActiveProps.style ||
    resolvedInactiveProps.style) && {
    ...(style as any),
    ...(resolvedActiveProps.style),
    ...(resolvedInactiveProps.style),
  }

  const [isTransitioning, setIsTransitioning] = useState(false)
  const hasRenderFetched = useRef(false)

  const preload =
    options.reloadDocument || externalLink
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = useCallback(() => {
    router.preloadRoute({ ..._options } as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router, _options])

  const preloadViewportIoCallback = useCallback(
    (entry: IntersectionObserverEntry | undefined) => {
      if (entry?.isIntersecting) {
        doPreload()
      }
    },
    [doPreload],
  )

  useIntersectionObserver(
    resolvedRef as RefObject<Element>,
    preloadViewportIoCallback,
    intersectionObserverOptions,
    { disabled: !!disabled || !(preload === 'viewport') },
  )

  useEffect(() => {
    if (hasRenderFetched.current) {
      return
    }
    if (!disabled && preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [disabled, doPreload, preload])

  // The click handler - no flushSync in Preact, use synchronous setState
  const handleClick = (e: MouseEvent) => {
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const effectiveTarget = target !== undefined ? target : elementTarget

    if (
      !disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()

      setIsTransitioning(true)

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        setIsTransitioning(false)
      })

      router.navigate({
        ..._options,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      })
    }
  }

  if (externalLink) {
    return {
      ...propsSafeToSpread,
      ref: resolvedRef,
      href: externalLink,
      ...(children && { children }),
      ...(target && { target }),
      ...(disabled && { disabled }),
      ...(style && { style }),
      ...(className && { className }),
      ...(onClick && { onClick }),
      ...(onFocus && { onFocus }),
      ...(onMouseEnter && { onMouseEnter }),
      ...(onMouseLeave && { onMouseLeave }),
      ...(onTouchStart && { onTouchStart }),
    }
  }

  const handleFocus = (_: FocusEvent) => {
    if (disabled) return
    if (preload) {
      doPreload()
    }
  }

  const handleTouchStart = handleFocus as any

  const handleEnter = (e: MouseEvent) => {
    if (disabled || !preload) return

    if (!preloadDelay) {
      doPreload()
    } else {
      const eventTarget = e.target as EventTarget
      if (timeoutMap.has(eventTarget)) {
        return
      }
      const id = setTimeout(() => {
        timeoutMap.delete(eventTarget)
        doPreload()
      }, preloadDelay)
      timeoutMap.set(eventTarget, id)
    }
  }

  const handleLeave = (e: MouseEvent) => {
    if (disabled || !preload || !preloadDelay) return
    const eventTarget = e.target as EventTarget
    const id = timeoutMap.get(eventTarget)
    if (id) {
      clearTimeout(id)
      timeoutMap.delete(eventTarget)
    }
  }

  return {
    ...propsSafeToSpread,
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href: hrefOption?.href,
    ref: resolvedRef,
    onClick: composeHandlers([onClick, handleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    disabled: !!disabled,
    target,
    ...(resolvedStyle && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(disabled && STATIC_DISABLED_PROPS),
    ...(isActive && STATIC_ACTIVE_PROPS),
    ...(isHydrated && isTransitioning && STATIC_TRANSITIONING_PROPS),
  }
}

const STATIC_EMPTY_OBJECT = {}
const STATIC_ACTIVE_OBJECT = { className: 'active' }
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true }
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' }
const STATIC_TRANSITIONING_PROPS = { 'data-transitioning': 'transitioning' }

const timeoutMap = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>()

const intersectionObserverOptions: IntersectionObserverInit = {
  rootMargin: '100px',
}

const composeHandlers =
  (handlers: Array<undefined | ((e: any) => void)>) =>
  (e: Event) => {
    for (const handler of handlers) {
      if (!handler) continue
      if (e.defaultPrevented) return
      handler(e)
    }
  }

function getHrefOption(
  publicHref: string,
  external: boolean,
  history: AnyRouter['history'],
  disabled: boolean | undefined,
) {
  if (disabled) return undefined
  if (external) {
    return { href: publicHref, external: true }
  }
  return {
    href: history.createHref(publicHref) || '/',
    external: false,
  }
}

function isSafeInternal(to: unknown) {
  if (typeof to !== 'string') return false
  const zero = to.charCodeAt(0)
  if (zero === 47) return to.charCodeAt(1) !== 47 // '/' but not '//'
  return zero === 46 // '.', '..', './', '../'
}

type UseLinkReactProps<TComp> = TComp extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[TComp]
  : TComp extends (props: infer P) => any
    ? P
    : never

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  UseLinkReactProps<'a'>

export type ActiveLinkOptions<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  ActiveLinkOptionProps<TComp>

type ActiveLinkProps<TComp> = Partial<
  LinkComponentReactProps<TComp> & {
    [key: `data-${string}`]: unknown
  }
>

export interface ActiveLinkOptionProps<TComp = 'a'> {
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  inactiveProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
}

export type LinkProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkPropsChildren

export interface LinkPropsChildren {
  children?:
    | ComponentChildren
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => ComponentChildren)
}

type LinkComponentReactProps<TComp> = Omit<
  UseLinkReactProps<TComp>,
  keyof CreateLinkProps
>

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentReactProps<TComp> &
  LinkProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type CreateLinkProps = LinkProps<
  any,
  any,
  string,
  string,
  string,
  string
>

export type LinkComponent<
  in out TComp,
  in out TDefaultFrom extends string = string,
> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = TDefaultFrom,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => VNode | null

export interface LinkComponentRoute<
  in out TDefaultFrom extends string = string,
> {
  defaultFrom: TDefaultFrom;
  <
    TRouter extends AnyRouter = RegisteredRouter,
    const TTo extends string | undefined = undefined,
    const TMaskTo extends string = '',
  >(
    props: LinkComponentProps<
      'a',
      TRouter,
      this['defaultFrom'],
      TTo,
      this['defaultFrom'],
      TMaskTo
    >,
  ): VNode | null
}

/**
 * Creates a typed Link-like component.
 * No forwardRef needed in Preact - ref is a regular prop.
 */
export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => ComponentChildren>,
): LinkComponent<TComp> {
  return function CreatedLink(props: any) {
    return <Link {...props} _asChild={Comp} />
  } as any
}

/**
 * A strongly-typed anchor component for declarative navigation.
 * No forwardRef in native Preact - ref is passed as a regular prop.
 */
export const Link: LinkComponent<'a'> = function LinkImpl(props: any) {
  const { _asChild, ref, ...rest } = props
  const linkProps = useLinkProps(rest, ref)
  // Remove 'type' if present since it's not a valid anchor attribute
  const { type: _type, ...cleanLinkProps } = linkProps

  const children =
    typeof rest.children === 'function'
      ? rest.children({
          isActive: (cleanLinkProps)['data-status'] === 'active',
        })
      : rest.children

  if (!_asChild) {
    const { disabled: _, ...rest } = cleanLinkProps
    return h('a', rest, children)
  }
  return h(_asChild, cleanLinkProps, children)
} as any

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type LinkOptionsFnOptions<
  TOptions,
  TComp,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<any>
    ? ValidateLinkOptionsArray<TRouter, TOptions, string, TComp>
    : ValidateLinkOptions<TRouter, TOptions, string, TComp>

export type LinkOptionsFn<TComp> = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions

/**
 * Validate and reuse navigation options for `Link`, `navigate` or `redirect`.
 */
export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}
