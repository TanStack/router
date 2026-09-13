'use client'

import * as React from 'react'
import { useSelector } from '@tanstack/react-store'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  getUrlScheme,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'

import { useForwardedRef, useIntersectionObserver } from './utils'

import { useHydrated } from './ClientOnly'
import type {
  ActiveOptions,
  AnyRouter,
  Constrain,
  LinkOptions,
  ParsedLocation,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type { ReactNode } from 'react'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

// Undefined active state marks an external or blocked link.
// Keep that classification with the href instead of parsing it again on render.
type LinkState = [href: string | undefined, isActive?: boolean]

// Keep a referentially stable value while the contents are equal. Links
// routinely pass inline `params` / `search` object literals, which would
// otherwise change `_options` identity on every parent render, rebuild the
// store selector, and discard its memoized selection.
//
// `ignoreUndefined: false` is required: an explicit `undefined` clears an
// inherited param or search key, so `{}` and `{ category: undefined }` build
// different locations and must not be treated as equal here.
function useValueStable<T>(value: T): T {
  const ref = React.useRef(value)
  // `deepEqual` short-circuits on reference equality, so this covers both cases.
  if (!deepEqual(ref.current, value, { ignoreUndefined: false })) {
    ref.current = value
  }
  return ref.current
}

function compareLinkState(a: LinkState, b: LinkState) {
  return a[0] === b[0] && a[1] === b[1]
}

function resolveExternalLink(
  to: string | undefined,
  protocolAllowlist: AnyRouter['protocolAllowlist'],
): string | null | undefined {
  const scheme = typeof to === 'string' && getUrlScheme(to)
  if (!scheme) {
    return undefined
  }
  if (!protocolAllowlist.has(scheme)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${to}`)
    }
    return null
  }
  return to
}

function resolveIsActive(
  location: ParsedLocation,
  next: ParsedLocation,
  activeOptions: ActiveOptions | undefined,
  basepath: string,
  isHydrated: boolean,
): boolean {
  const currentPath = removeTrailingSlash(location.pathname, basepath)
  const nextPath = removeTrailingSlash(next.pathname, basepath)

  // Both modes compare normalized paths; fuzzy matches need a segment boundary.
  if (
    activeOptions?.exact
      ? currentPath !== nextPath
      : !(
          currentPath.startsWith(nextPath) &&
          (currentPath.length === nextPath.length ||
            currentPath[nextPath.length] === '/')
        )
  ) {
    return false
  }

  if (activeOptions?.includeSearch ?? true) {
    const searchTest = deepEqual(location.search, next.search, {
      partial: !activeOptions?.exact,
      ignoreUndefined: !activeOptions?.explicitUndefined,
    })
    if (!searchTest) {
      return false
    }
  }

  if (activeOptions?.includeHash) {
    return isHydrated && location.hash === next.hash
  }
  return true
}

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
  const innerRef = useForwardedRef(forwardedRef)

  const {
    // custom props
    activeProps,
    inactiveProps,
    activeOptions,
    to: toOption,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    preloadIntentProximity: _preloadIntentProximity,
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
    onBlur,
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
  const to = toOption as string | undefined

  // ==========================================================================
  // SERVER EARLY RETURN
  // On the server, we return static props without any event handlers,
  // effects, or client-side interactivity.
  //
  // For SSR parity (to avoid hydration errors), we still compute the link's
  // active status on the server, but we avoid creating any router-state
  // subscriptions by reading from the location store directly.
  //
  // Note: `location.hash` is not available on the server.
  // ==========================================================================
  // The expression must stay inlined in the `if` so bundlers fold the
  // browser-build constant `isServer = false` and drop this server block.
  if (isServer ?? router.isServer) {
    const directExternalLink = resolveExternalLink(to, router.protocolAllowlist)

    // Direct-scheme links need no route resolution. Blocked links still use
    // the shared inactive-prop merge so their server and client markup agree.
    const next =
      directExternalLink === undefined
        ? router.buildLocation(options as any)
        : undefined

    // Use publicHref - it contains the correct href for display
    // When a rewrite changes the origin, publicHref is the full URL
    // Otherwise it's the origin-stripped path
    // This avoids constructing URL objects in the hot path
    const hrefOption = next
      ? getHrefOption(next, router, disabled)
      : (directExternalLink ?? undefined)
    const linkDisabled = disabled || !hrefOption

    const externalLink =
      directExternalLink ??
      (hrefOption && getUrlScheme(hrefOption) ? hrefOption : undefined)

    const isActive = (() => {
      if (!next || (!disabled && !hrefOption) || externalLink) {
        return false
      }

      const currentLocation = router.stores.location.get()

      const exact = activeOptions?.exact ?? false

      if (exact) {
        const testExact = exactPathTest(
          currentLocation.pathname,
          next.pathname,
          router.basepath,
        )
        if (!testExact) {
          return false
        }
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

        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      const includeSearch = activeOptions?.includeSearch ?? true
      if (includeSearch) {
        if (currentLocation.search !== next.search) {
          const currentSearchEmpty =
            !currentLocation.search ||
            (typeof currentLocation.search === 'object' &&
              !hasKeys(currentLocation.search))
          const nextSearchEmpty =
            !next.search ||
            (typeof next.search === 'object' &&
              !hasKeys(next.search as Record<string, unknown>))

          if (!(currentSearchEmpty && nextSearchEmpty)) {
            const searchTest = deepEqual(currentLocation.search, next.search, {
              partial: !exact,
              ignoreUndefined: !activeOptions?.explicitUndefined,
            })
            if (!searchTest) {
              return false
            }
          }
        }
      }

      // Hash is not available on the server
      if (activeOptions?.includeHash) {
        return false
      }

      return true
    })()

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
      }
    }

    const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> =
      isActive
        ? (functionalUpdate(activeProps as any, {}) ?? STATIC_ACTIVE_OBJECT)
        : STATIC_EMPTY_OBJECT

    const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
      isActive
        ? STATIC_EMPTY_OBJECT
        : (functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT)

    const resolvedStyle = (() => {
      const baseStyle = style
      const activeStyle = resolvedActiveProps.style
      const inactiveStyle = resolvedInactiveProps.style

      if (!baseStyle && !activeStyle && !inactiveStyle) {
        return undefined
      }

      if (baseStyle && !activeStyle && !inactiveStyle) {
        return baseStyle
      }

      if (!baseStyle && activeStyle && !inactiveStyle) {
        return activeStyle
      }

      if (!baseStyle && !activeStyle && inactiveStyle) {
        return inactiveStyle
      }

      return {
        ...baseStyle,
        ...activeStyle,
        ...inactiveStyle,
      }
    })()

    const resolvedClassName = (() => {
      const baseClassName = className
      const activeClassName = resolvedActiveProps.className
      const inactiveClassName = resolvedInactiveProps.className

      if (!baseClassName && !activeClassName && !inactiveClassName) {
        return ''
      }

      let out = ''

      if (baseClassName) {
        out = baseClassName
      }

      if (activeClassName) {
        out = out ? `${out} ${activeClassName}` : activeClassName
      }

      if (inactiveClassName) {
        out = out ? `${out} ${inactiveClassName}` : inactiveClassName
      }

      return out
    })()

    return {
      ...propsSafeToSpread,
      ...resolvedActiveProps,
      ...resolvedInactiveProps,
      href: hrefOption,
      ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
      disabled: !!linkDisabled,
      target,
      ...(resolvedStyle && { style: resolvedStyle }),
      ...(resolvedClassName && { className: resolvedClassName }),
      ...(linkDisabled && STATIC_DISABLED_PROPS),
      ...(isActive && STATIC_ACTIVE_PROPS),
    }
  }

  // ==========================================================================
  // CLIENT-ONLY CODE
  // Everything below this point only runs on the client. The `isServer` check
  // above is a compile-time constant that bundlers use for dead code elimination,
  // so this entire section is removed from server bundles.
  //
  // We disable the rules-of-hooks lint rule because these hooks appear after
  // an early return. This is safe because:
  // 1. `isServer` is a compile-time constant from conditional exports
  // 2. In server bundles, this code is completely eliminated by the bundler
  // 3. In client bundles, `isServer` is `false`, so the early return never executes
  // ==========================================================================

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isHydrated = useHydrated()

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stableSearch = useValueStable(options.search)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stableParams = useValueStable(options.params)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const stableActiveOptions = useValueStable(activeOptions)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const _options = React.useMemo(
    () => options,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      router,
      options.from,
      options._fromLocation,
      options.hash,
      options.to,
      stableSearch,
      stableParams,
      options.state,
      options.mask,
      options.unsafeRelative,
    ],
  )

  // Derive inside the selector so `compareLinkState` can bail out. Deriving after
  // the subscription instead re-renders every link on every navigation, because
  // the comparator only sees the location, not whether this link's output moved.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const selectLinkState = React.useCallback(
    (location: ParsedLocation): LinkState => {
      const directExternalLink = resolveExternalLink(
        to,
        router.protocolAllowlist,
      )
      if (directExternalLink !== undefined) {
        return [directExternalLink ?? undefined]
      }

      const next = router.buildLocation({
        _fromLocation: location,
        ..._options,
      } as any)

      // Use publicHref - it contains the correct href for display
      // When a rewrite changes the origin, publicHref is the full URL
      // Otherwise it's the origin-stripped path
      // This avoids constructing URL objects in the hot path
      const hrefOption = getHrefOption(next, router, disabled)
      return [
        hrefOption,
        !disabled && (!hrefOption || getUrlScheme(hrefOption))
          ? undefined
          : resolveIsActive(
              location,
              next,
              stableActiveOptions,
              router.basepath,
              isHydrated,
            ),
      ]
    },
    [stableActiveOptions, disabled, isHydrated, _options, router, to],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [href, isActive] = useSelector(
    router.stores.location,
    selectLinkState,
    { compare: compareLinkState },
  )
  const externalLink = isActive === undefined ? href : undefined
  const linkDisabled = disabled || href === undefined

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const hasRenderFetched = React.useRef(false)

  const preload =
    options.reloadDocument || externalLink || linkDisabled
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const doPreload = React.useCallback(() => {
    // `preloadRoute` builds the location itself; it is no longer held in render
    // state. It only reads the options, so `_options` can go through as-is.
    router.preloadRoute(_options as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [router, _options])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const enqueuePreload = React.useCallback(
    (e?: React.MouseEvent | React.FocusEvent | IntersectionObserverEntry) => {
      if (!e) {
        cancelPreload(innerRef)
        return
      }

      if (
        !(
          (e as IntersectionObserverEntry).isIntersecting ??
          preload === 'intent'
        )
      ) {
        if ((e as IntersectionObserverEntry).isIntersecting === false) {
          cancelPreload(innerRef)
        }
        return
      }

      if (!preloadDelay) {
        doPreload()
        return
      }

      if (timeoutMap.has(innerRef)) {
        return
      }

      timeoutMap.set(
        innerRef,
        setTimeout(() => {
          timeoutMap.delete(innerRef)
          doPreload()
        }, preloadDelay),
      )
    },
    [doPreload, innerRef, preload, preloadDelay],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useIntersectionObserver(innerRef, enqueuePreload, preload !== 'viewport')

  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    if (hasRenderFetched.current) {
      return
    }
    if (preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [doPreload, preload])

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
      ...(onBlur && { onBlur }),
      ...(onFocus && { onFocus }),
      ...(onMouseEnter && { onMouseEnter }),
      ...(onMouseLeave && { onMouseLeave }),
      ...(onTouchStart && { onTouchStart }),
    }
  }

  // Only one state contributes props, so resolve and merge it once.
  const resolvedStateProps: React.HTMLAttributes<HTMLAnchorElement> =
    functionalUpdate(isActive ? (activeProps as any) : inactiveProps, {}) ??
    (isActive ? STATIC_ACTIVE_OBJECT : STATIC_EMPTY_OBJECT)

  const stateClassName = resolvedStateProps.className
  const resolvedClassName = className
    ? stateClassName
      ? `${className} ${stateClassName}`
      : className
    : stateClassName
  const stateStyle = resolvedStateProps.style
  const resolvedStyle =
    style && stateStyle ? { ...style, ...stateStyle } : style || stateStyle

  // The click handler
  const handleClick = (e: React.MouseEvent) => {
    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const effectiveTarget = target !== undefined ? target : elementTarget

    if (
      !linkDisabled &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()

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

  const handleTouchStart = () => {
    if (preload !== 'intent') return
    doPreload()
  }

  const handleLeave = () => {
    if (preload === 'intent') {
      cancelPreload(innerRef)
    }
  }

  return {
    ...propsSafeToSpread,
    ...resolvedStateProps,
    href,
    ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
    onClick: composeHandlers(onClick, handleClick),
    onBlur: composeHandlers(onBlur, handleLeave),
    onFocus: composeHandlers(onFocus, enqueuePreload),
    onMouseEnter: composeHandlers(onMouseEnter, enqueuePreload),
    onMouseLeave: composeHandlers(onMouseLeave, handleLeave),
    onTouchStart: composeHandlers(onTouchStart, handleTouchStart),
    disabled: !!linkDisabled,
    target,
    ...(resolvedStyle && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(linkDisabled && STATIC_DISABLED_PROPS),
    ...(isActive && STATIC_ACTIVE_PROPS),
  }
}

const STATIC_EMPTY_OBJECT = {}
const STATIC_ACTIVE_OBJECT = { className: 'active' }
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true }
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' }

const timeoutMap = new WeakMap<object, ReturnType<typeof setTimeout>>()
const cancelPreload = (eventTarget: object) => {
  clearTimeout(timeoutMap.get(eventTarget))
  timeoutMap.delete(eventTarget)
}

export const composeHandlers = (
  first: React.EventHandler<any> | undefined,
  second: React.EventHandler<any>,
) => {
  if (!first) {
    return second
  }

  // The first guard skips user handlers for already-prevented events; the second
  // lets user handlers prevent the internal handler from running.
  return (event: React.SyntheticEvent) =>
    event.defaultPrevented ||
    (first(event), event.defaultPrevented || second(event))
}

function getHrefOption(
  next: ParsedLocation,
  router: AnyRouter,
  disabled: boolean | undefined,
) {
  if (disabled) {
    return undefined
  }
  const location = next.maskedLocation ?? next
  // A rewritten external URL must bypass history's relative-path formatting.
  const href = location.external
    ? location.publicHref
    : router.history.createHref(location.publicHref) || '/'
  if (
    (location.external || href !== location.publicHref) &&
    isDangerousProtocol(href, router.protocolAllowlist)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${href}`)
    }
    return undefined
  }
  return href
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
    | ((state: { isActive: boolean }) => React.ReactNode)
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
 * - `preloadDelay`: Delay in ms before preloading on focus, hover, or viewport entry
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
    // eslint-disable-next-line prefer-const -- The rest binding is reassigned below.
    let { type: _type, ...linkProps } = useLinkProps(rest as any, ref)

    const children =
      typeof rest.children === 'function'
        ? rest.children({
            isActive: (linkProps as any)['data-status'] === 'active',
          })
        : rest.children

    if (!_asChild) {
      // the ReturnType of useLinkProps returns the correct type for a <a> element, not a general component that has a disabled prop
      // @ts-expect-error
      const { disabled: _, ...rest } = linkProps
      linkProps = rest
    }
    return React.createElement(_asChild || 'a', linkProps, children)
  },
) as any

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
