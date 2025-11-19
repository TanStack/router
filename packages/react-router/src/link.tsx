import * as React from 'react'
import { flushSync } from 'react-dom'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'

import { useForwardedRef, useIntersectionObserver } from './utils'

import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type { ReactNode } from 'react'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

/**
 * Build anchor-like props for declarative navigation and preloading.
 *
 * Returns stable `href`, event handlers and accessibility props derived from
 * router options and active state. Used internally by `Link` and custom links.
 *
 * Options cover `to`, `params`, `search`, `hash`, `state`, `preload`,
 * `activeProps`, `inactiveProps`, and more.
 *
 * @returns React anchor props suitable for `<a>` or custom components.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLinkPropsHook
 */
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  forwardedRef?: React.ForwardedRef<Element>,
): React.ComponentPropsWithRef<'a'> {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = React.useState(false)
  const hasRenderFetched = React.useRef(false)
  const innerRef = useForwardedRef(forwardedRef)

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

  // subscribe to search params to re-build location if it changes
  const currentSearch = useRouterState({
    select: (s) => s.location.search,
    structuralSharing: true as any,
  })

  const from = options.from

  const _options = React.useMemo(
    () => {
      return { ...options, from }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const next = React.useMemo(
    () => router.buildLocation({ ..._options } as any),
    [router, _options],
  )

  const hrefOption = React.useMemo(() => {
    if (disabled) {
      return undefined
    }
    let href = next.maskedLocation ? next.maskedLocation.url : next.url

    let external = false
    if (router.origin) {
      if (href.startsWith(router.origin)) {
        href = router.history.createHref(href.replace(router.origin, '')) || '/'
      } else {
        external = true
      }
    }
    return { href, external }
  }, [disabled, next.maskedLocation, next.url, router.origin, router.history])

  const externalLink = React.useMemo(() => {
    if (hrefOption?.external) {
      return hrefOption.href
    }
    try {
      new URL(to as any)
      return to
    } catch {}
    return undefined
  }, [to, hrefOption])

  const preload =
    options.reloadDocument || externalLink
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      if (externalLink) return false
      if (activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next.pathname,
          router.basepath,
        )
        if (!testExact) {
          return false
        }
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

        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.search, {
          partial: !activeOptions?.exact,
          ignoreUndefined: !activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (activeOptions?.includeHash) {
        return s.location.hash === next.hash
      }
      return true
    },
  })

  const doPreload = React.useCallback(() => {
    router.preloadRoute({ ..._options } as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router, _options])

  const preloadViewportIoCallback = React.useCallback(
    (entry: IntersectionObserverEntry | undefined) => {
      if (entry?.isIntersecting) {
        doPreload()
      }
    },
    [doPreload],
  )

  useIntersectionObserver(
    innerRef,
    preloadViewportIoCallback,
    intersectionObserverOptions,
    { disabled: !!disabled || !(preload === 'viewport') },
  )

  React.useEffect(() => {
    if (hasRenderFetched.current) {
      return
    }
    if (!disabled && preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [disabled, doPreload, preload])

  // The click handler
  const handleClick = (e: React.MouseEvent) => {
    // Check actual element's target attribute as fallback
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

      flushSync(() => {
        setIsTransitioning(true)
      })

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        setIsTransitioning(false)
      })

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
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
      ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
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

  // The click handler
  const handleFocus = (_: React.MouseEvent) => {
    if (disabled) return
    if (preload) {
      doPreload()
    }
  }

  const handleTouchStart = handleFocus

  const handleEnter = (e: React.MouseEvent) => {
    if (disabled || !preload) return

    if (!preloadDelay) {
      doPreload()
    } else {
      const eventTarget = e.target
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

  const handleLeave = (e: React.MouseEvent) => {
    if (disabled || !preload || !preloadDelay) return
    const eventTarget = e.target
    const id = timeoutMap.get(eventTarget)
    if (id) {
      clearTimeout(id)
      timeoutMap.delete(eventTarget)
    }
  }

  // Get the active props
  const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> = isActive
    ? (functionalUpdate(activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
    : STATIC_EMPTY_OBJECT

  // Get the inactive props
  const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
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
    ...style,
    ...resolvedActiveProps.style,
    ...resolvedInactiveProps.style,
  }

  return {
    ...propsSafeToSpread,
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href: hrefOption?.href,
    ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
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
    ...(isTransitioning && STATIC_TRANSITIONING_PROPS),
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
  (handlers: Array<undefined | React.EventHandler<any>>) =>
  (e: React.SyntheticEvent) => {
    for (const handler of handlers) {
      if (!handler) continue
      if (e.defaultPrevented) return
      handler(e)
    }
  }

type UseLinkReactProps<TComp> = TComp extends keyof React.JSX.IntrinsicElements
  ? React.JSX.IntrinsicElements[TComp]
  : TComp extends React.ComponentType<any>
    ? React.ComponentPropsWithoutRef<TComp> &
        React.RefAttributes<React.ComponentRef<TComp>>
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
  /**
   * A function that returns additional props for the `active` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
   */
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  /**
   * A function that returns additional props for the `inactive` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
   */
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
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?:
    | React.ReactNode
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => React.ReactNode)
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
) => React.ReactElement

export interface LinkComponentRoute<
  in out TDefaultFrom extends string = string,
> {
  defaultFrom: TDefaultFrom
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
  ): React.ReactElement
}

/**
 * Creates a typed Link-like component that preserves TanStack Router's
 * navigation semantics and type-safety while delegating rendering to the
 * provided host component.
 *
 * Useful for integrating design system anchors/buttons while keeping
 * router-aware props (eg. `to`, `params`, `search`, `preload`).
 *
 * @param Comp The host component to render (eg. a design-system Link/Button)
 * @returns A router-aware component with the same API as `Link`.
 * @link https://tanstack.com/router/latest/docs/framework/react/guide/custom-link
 */
export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => ReactNode>,
): LinkComponent<TComp> {
  return React.forwardRef(function CreatedLink(props, ref) {
    return <Link {...(props as any)} _asChild={Comp} ref={ref} />
  }) as any
}

/**
 * A strongly-typed anchor component for declarative navigation.
 * Handles path, search, hash and state updates with optional route preloading
 * and active-state styling.
 *
 * Props:
 * - `preload`: Controls route preloading (eg. 'intent', 'render', 'viewport', true/false)
 * - `preloadDelay`: Delay in ms before preloading on hover
 * - `activeProps`/`inactiveProps`: Additional props merged when link is active/inactive
 * - `resetScroll`/`hashScrollIntoView`: Control scroll behavior on navigation
 * - `viewTransition`/`startTransition`: Use View Transitions/React transitions for navigation
 * - `ignoreBlocker`: Bypass registered blockers
 *
 * @returns An anchor-like element that navigates without full page reloads.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/linkComponent
 */
export const Link: LinkComponent<'a'> = React.forwardRef<Element, any>(
  (props, ref) => {
    const { _asChild, ...rest } = props
    const {
      type: _type,
      ref: innerRef,
      ...linkProps
    } = useLinkProps(rest as any, ref)

    const children =
      typeof rest.children === 'function'
        ? rest.children({
            isActive: (linkProps as any)['data-status'] === 'active',
          })
        : rest.children

    if (_asChild === undefined) {
      // the ReturnType of useLinkProps returns the correct type for a <a> element, not a general component that has a disabled prop
      // @ts-expect-error
      delete linkProps.disabled
    }

    return React.createElement(
      _asChild ? _asChild : 'a',
      {
        ...linkProps,
        ref: innerRef,
      },
      children,
    )
  },
) as any

function isCtrlEvent(e: React.MouseEvent) {
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
 * Accepts a literal options object and returns it typed for later spreading.
 * @example
 * const opts = linkOptions({ to: '/dashboard', search: { tab: 'home' } })
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/linkOptions
 */
export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}

/**
 * Type-check a literal object for use with `Link`, `navigate` or `redirect`.
 * Use to validate and reuse navigation options across your app.
 * @example
 * const opts = linkOptions({ to: '/dashboard', search: { tab: 'home' } })
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/linkOptions
 */
