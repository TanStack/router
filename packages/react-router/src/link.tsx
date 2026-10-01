'use client'

import * as React from 'react'
import {
  createLinkStore,
  deepEqual,
  functionalUpdate,
  preloadWarning,
  readLinkSnapshot,
  readLinkState,
  refreshLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import { matchContext } from './matchContext'

import { useHydrated } from './ClientOnly'
import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  LinkView,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type { ReactNode } from 'react'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

// Keep referentially stable values while their contents are equal. Links
// routinely pass inline `params` / `search` object literals, which would
// otherwise rebuild the Link descriptor on every parent render and discard
// its prepared destination. One ref holds all of
// them; each entry is replaced only when its own contents change.
//
// The descriptor retains its built location until an observed input changes.
// The references returned here identify changed destination props: pass a
// new object to change a destination. Like every other React prop, an object
// mutated in place is not re-read. `deepEqual` short-circuits on reference
// equality, so an unchanged reference costs nothing.
//
// `explicitUndefined` is required: an explicit `undefined` clears an
// inherited param or search key, so `{}` and `{ category: undefined }` build
// different locations and must not be treated as equal here.
function useStableValues<T extends ReadonlyArray<unknown>>(...values: T): T {
  const ref = React.useRef<ReadonlyArray<unknown>>(values)
  const stable = ref.current as Array<unknown>
  values.forEach((value, index) => {
    if (!deepEqual(stable[index], value, false, true)) {
      stable[index] = value
    }
  })
  return ref.current as T
}

function preloadLink(router: AnyRouter, options: unknown) {
  router.preloadRoute(options as any).catch((err) => {
    console.warn(err)
    console.warn(preloadWarning)
  })
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
): React.ComponentPropsWithRef<'a'>
/**
 * `host` is what the props are rendered on: `'a'` for `Link` or the component
 * given to `createLink`. `Link` never renders `type` and an anchor never
 * receives `disabled`, so those are left out here rather than copied away
 * from the result in the component. Stripped from the public declarations.
 *
 * @internal
 */
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  forwardedRef: React.ForwardedRef<Element> | undefined,
  host: 'a' | React.ElementType,
): React.ComponentPropsWithRef<'a'>
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  forwardedRef?: React.ForwardedRef<Element>,
  host?: 'a' | React.ElementType,
): React.ComponentPropsWithRef<'a'> {
  const router = useRouter()

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
  // browser-build constant `isServer = false` and drop this server block,
  // together with `getServerLinkProps` and the key sets only it references.
  if (isServer ?? router.isServer) {
    return getServerLinkProps(router, options, forwardedRef, host)
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

  // The link's own ref holds the element for the viewport observer.
  // A forwarded ref is filled alongside it by one
  // callback, memoized on the forwarded ref so React re-attaches it (and
  // notifies the consumer) only when their ref changes, not on every render.
  // A cleanup returned by a consumer callback is passed through to React.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const innerRef = React.useRef<Element>(null)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const mergedRef = React.useCallback(
    (element: Element | null) => {
      innerRef.current = element
      if (typeof forwardedRef === 'function') {
        return forwardedRef(element)
      }
      if (forwardedRef) {
        forwardedRef.current = element
      }
      return undefined
    },
    [forwardedRef],
  )

  const {
    activeOptions,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    disabled,
    target,
    onClick,
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
  } = options as typeof options & { to?: string }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const isHydrated = useHydrated(!!activeOptions?.includeHash)

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [stableSearch, stableParams, stableActiveOptions] = useStableValues(
    options.search,
    options.params,
    activeOptions,
  )
  // Registration belongs to the mounted Link; destination views belong to
  // individual renders so abandoned work cannot replace its committed options.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ownerRouteId = React.useContext(matchContext)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const linkStore = React.useMemo(() => createLinkStore(router), [router])
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const linkView = React.useMemo(
    () => {
      const view: LinkView = [
        linkStore,
        options as any,
        ownerRouteId,
        isHydrated ? undefined : false,
        undefined,
        undefined,
        undefined,
        () => readLinkSnapshot(view),
      ]
      return view
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      linkStore,
      options.from,
      options._fromLocation,
      options.hash,
      options.to,
      options.href,
      stableSearch,
      stableParams,
      options.state,
      options.mask,
      options.unsafeRelative,
      stableActiveOptions,
      disabled,
      ownerRouteId,
      isHydrated,
    ],
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useLayoutEffect(() => {
    refreshLink(linkView, true)
  }, [linkView])
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [href, isActive] = React.useSyncExternalStore(
    linkStore[3 /* subscribe */],
    linkView[7 /* getSnapshot */]!,
    linkView[7 /* getSnapshot */],
  )
  const externalLink = isActive === undefined && href
  const linkDisabled = disabled || href === undefined

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const preloadState = React.useRef<
    [renderFetched: boolean, timeout: ReturnType<typeof setTimeout> | undefined]
  >([false, undefined]).current

  const preload =
    options.reloadDocument || externalLink || linkDisabled
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  // `preloadRoute` builds the location itself and only reads the options, so
  // `options` goes through as-is.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const enqueuePreload = React.useCallback(
    (e?: React.MouseEvent | React.FocusEvent | IntersectionObserverEntry) => {
      const isIntersecting = (e as IntersectionObserverEntry | undefined)
        ?.isIntersecting
      if (!(isIntersecting ?? preload === 'intent')) {
        if (isIntersecting === false) {
          cancelPreload(preloadState)
        }
        return
      }

      if (!preloadDelay) {
        preloadLink(router, options)
        return
      }

      if (preloadState[1 /* timeout */] !== undefined) {
        return
      }

      preloadState[1 /* timeout */] = setTimeout(() => {
        preloadState[1 /* timeout */] = undefined
        preloadLink(router, options)
      }, preloadDelay)
    },
    // Destination changes refresh the captured preload options. View-only
    // changes leave pending intent timers and viewport observers intact.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      router,
      options.from,
      options._fromLocation,
      options.hash,
      options.to,
      options.href,
      stableSearch,
      stableParams,
      options.state,
      options.mask,
      options.unsafeRelative,
      innerRef,
      preload,
      preloadDelay,
    ],
  )

  // Preload side effects: `render` preloads once per link, `viewport` watches
  // the element. The cleanup also cancels a pending intent timer.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  React.useEffect(() => {
    // Disabled preloading creates neither an observer nor an intent timer.
    if (!preload) {
      return
    }
    if (preload === 'render' && !preloadState[0 /* renderFetched */]) {
      preloadState[0 /* renderFetched */] = true
      preloadLink(router, options)
    }
    let active = true
    let observer: IntersectionObserver | undefined
    if (
      preload === 'viewport' &&
      innerRef.current &&
      typeof IntersectionObserver === 'function'
    ) {
      observer = new IntersectionObserver(
        (entries) => {
          // A queued observer notification can arrive after disconnect().
          if (active) {
            enqueuePreload(entries.pop())
          }
        },
        { rootMargin: '100px' },
      )
      observer.observe(innerRef.current)
    }
    return () => {
      active = false
      observer?.disconnect()
      cancelPreload(preloadState)
    }
    // enqueuePreload changes for every destination or preload-option change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, preload, enqueuePreload, innerRef])

  const props = collectElementProps(options, host)
  props.ref = forwardedRef ? mergedRef : innerRef
  // External links get no router behavior: element props pass through as given.
  if (externalLink) {
    props.href = externalLink
    return props
  }

  // The click handler
  const handleClick = (e: React.MouseEvent) => {
    // The element's own target attribute is the fallback.
    const effectiveTarget =
      target ??
      (e.currentTarget as HTMLAnchorElement | SVGAElement).getAttribute(
        'target',
      )

    if (
      !linkDisabled &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      cancelPreload(innerRef)

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate(options as any)
    }
  }

  const handleTouchStart = () => {
    if (preload === 'intent') {
      preloadLink(router, options)
    }
  }

  const handleLeave = () => {
    if (preload === 'intent') {
      cancelPreload(preloadState)
    }
  }

  props.onClick = composeHandlers(onClick, handleClick)
  props.onBlur = composeHandlers(onBlur, handleLeave)
  props.onFocus = composeHandlers(onFocus, enqueuePreload)
  props.onMouseEnter = composeHandlers(onMouseEnter, enqueuePreload)
  props.onMouseLeave = composeHandlers(onMouseLeave, handleLeave)
  props.onTouchStart = composeHandlers(onTouchStart, handleTouchStart)
  return applyLinkState(props, options, isActive, href, linkDisabled, host)
}

const STATIC_EMPTY_OBJECT = {}
const STATIC_ACTIVE_OBJECT = { className: 'active' }
// Options the router consumes; they never reach the element. Every other
// option is an element prop and passes through.
const ROUTER_OPTION_KEYS = /* @__PURE__ */ new Set([
  'to',
  'params',
  'search',
  'hash',
  'state',
  'mask',
  'from',
  'unsafeRelative',
  '_fromLocation',
  'reloadDocument',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'hashScrollIntoView',
  'replace',
  'startTransition',
  'resetScroll',
  'viewTransition',
  'ignoreBlocker',
  'activeProps',
  'inactiveProps',
  'activeOptions',
  '_asChild',
])

// Copies the element props. An object rest would test every key against the
// whole exclusion list; the key set is much cheaper. `Link` hosts never render
// `type`, and an anchor has no `disabled` attribute.
function collectElementProps(
  options: object,
  host: 'a' | React.ElementType | undefined,
): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const key in options) {
    if (
      ROUTER_OPTION_KEYS.has(key) ||
      (key === 'type' && host !== undefined) ||
      (key === 'disabled' && host === 'a')
    ) {
      continue
    }
    props[key] = (options as Record<string, unknown>)[key]
  }
  return props
}

// Finishes a router-controlled link: the selected state props, then the
// routing attributes. This is the one place that defines precedence: state
// props override element props, `ref` and handlers; `href`, `disabled`,
// `target` and the merged class and style always win.
function applyLinkState(
  props: Record<string, unknown>,
  options: {
    activeProps?: unknown
    inactiveProps?: unknown
    className?: string
    style?: React.CSSProperties
    target?: string
  },
  isActive: boolean | undefined,
  href: string | undefined,
  linkDisabled: boolean,
  host: 'a' | React.ElementType | undefined,
): React.ComponentPropsWithRef<'a'> {
  const { activeProps, inactiveProps, className, style, target } = options
  const stateProps: React.HTMLAttributes<HTMLAnchorElement> =
    functionalUpdate((isActive ? activeProps : inactiveProps) as any, {}) ??
    (isActive ? STATIC_ACTIVE_OBJECT : STATIC_EMPTY_OBJECT)
  Object.assign(props, stateProps)
  props.href = href
  if (host !== 'a') {
    props.disabled = linkDisabled
  }
  props.target = target
  // Merge class and style with the state's. Links without either keep their
  // props as given and carry no `undefined` keys.
  const stateStyle = stateProps.style
  if (style || stateStyle) {
    props.style =
      style && stateStyle ? { ...style, ...stateStyle } : style || stateStyle
  }
  const stateClassName = stateProps.className
  if (className || stateClassName) {
    props.className = className
      ? stateClassName
        ? `${className} ${stateClassName}`
        : className
      : stateClassName
  }
  if (linkDisabled) {
    props.role = 'link'
    props['aria-disabled'] = true
  }
  if (isActive) {
    props['data-status'] = 'active'
    props['aria-current'] = 'page'
  }
  return props
}

// Server render of a Link: static props only, no hooks. Only server bundles
// keep this function; the `isServer` check that calls it folds away on the client.
function getServerLinkProps(
  router: AnyRouter,
  options: any,
  forwardedRef: React.ForwardedRef<Element> | undefined,
  host: 'a' | React.ElementType | undefined,
): React.ComponentPropsWithRef<'a'> {
  const [href, isActive] = readLinkState(router, options, false)
  const props = collectElementProps(options, host)
  props.ref = forwardedRef
  if (isActive === undefined && href) {
    props.href = href
    return props
  }
  return applyLinkState(
    props,
    options,
    isActive,
    href,
    options.disabled || !href,
    host,
  )
}

function cancelPreload(
  state: [
    renderFetched: boolean,
    timeout: ReturnType<typeof setTimeout> | undefined,
  ],
) {
  clearTimeout(state[1 /* timeout */])
  state[1 /* timeout */] = undefined
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
export const Link: LinkComponent<'a'> = React.memo(
  React.forwardRef<Element, any>((props, ref) => {
    const host = props._asChild || 'a'
    const linkProps = useLinkProps(props as any, ref, host)

    const children =
      typeof props.children === 'function'
        ? props.children({
            isActive: (linkProps as any)['data-status'] === 'active',
          })
        : props.children

    return React.createElement(host, linkProps, children)
  }),
  areLinkPropsEqual,
) as any

// A Link's output depends only on its props, the router context and the
// location store, which React tracks for memoized components, so a parent
// re-render with equal props can skip it. Router options are compared by
// value: destinations are usually inline object literals. Element props
// (`children`, handlers, `style`, ...) are compared by reference only, since
// they may hold arbitrary (even cyclic) data.
function areLinkPropsEqual(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): boolean {
  let extraKeys = 0
  for (const key in next) {
    extraKeys++
    if (prev[key] === next[key]) {
      continue
    }
    if (
      !ROUTER_OPTION_KEYS.has(key) ||
      !deepEqual(prev[key], next[key], false, true)
    ) {
      return false
    }
  }
  for (const _key in prev) {
    extraKeys--
  }
  return extraKeys === 0
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
