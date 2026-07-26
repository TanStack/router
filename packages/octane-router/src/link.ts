// useLinkProps / createLink / linkOptions — port of react-router's link.tsx
// (client path; SSR link rendering arrives with the SSR entries). All of Link's
// behavior lives here so both `<Link>` and custom `createLink` components share
// it: href building (mask-aware via publicHref), external-URL detection with
// dangerous-protocol blocking, active-state detection (exactPathTest /
// trailing-slash-aware fuzzy prefix + deepEqual partial search match),
// preloading ('intent' with delay + touchstart/focus, 'viewport' via
// IntersectionObserver, 'render' once on mount), the click handler (navigate
// with replace/resetScroll/hashScrollIntoView/viewTransition/startTransition/
// ignoreBlocker forwarded), and data-status/data-transitioning reflection.
import {
  createElement,
  flushSync,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'octane'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { useRouter } from './context'
import { useStore } from './useStore'
import { splitSlot, subSlot } from './internal'
import { Link } from './Link.tsrx'
import type { ComponentBody } from 'octane'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'
import type {
  LinkComponent,
  OctaneAnchorProps,
  UseLinkPropsOptions,
} from './linkTypes'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

const STATIC_EMPTY_OBJECT = {}
const STATIC_ACTIVE_OBJECT = { class: 'active' }
const STATIC_DISABLED_PROPS = { role: 'link', 'aria-disabled': true }
const STATIC_ACTIVE_PROPS = { 'data-status': 'active', 'aria-current': 'page' }
const STATIC_TRANSITIONING_PROPS = { 'data-transitioning': 'transitioning' }

const timeoutMap = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>()

const composeHandlers =
  (handlers: Array<undefined | ((e: any) => void)>) => (e: Event) => {
    for (const handler of handlers) {
      if (!handler) {
        continue
      }
      if (e.defaultPrevented) {
        return
      }
      handler(e)
    }
  }

function getHrefOption(
  publicHref: string,
  external: boolean,
  history: any,
  disabled: boolean | undefined,
): { href: string; external: boolean } | undefined {
  if (disabled) {
    return undefined
  }
  // Full URL means a rewrite changed the origin — treat as external-like.
  if (external) {
    return { href: publicHref, external: true }
  }
  return { href: history.createHref(publicHref) || '/', external: false }
}

function isSafeInternal(to: unknown): boolean {
  if (typeof to !== 'string') {
    return false
  }
  const zero = to.charCodeAt(0)
  if (zero === 47) {
    return to.charCodeAt(1) !== 47 // '/' but not '//'
  }
  return zero === 46 // '.', '..', './', '../'
}

function isCtrlEvent(e: MouseEvent): boolean {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

// Merge base/active/inactive styles. Objects merge like upstream; if any is a
// string the parts join with ';' (octane host styles accept both forms).
function mergeStyles(base: any, active: any, inactive: any): any {
  if (!base && !active && !inactive) {
    return undefined
  }
  const parts = [base, active, inactive].filter(Boolean)
  if (parts.length === 1) {
    return parts[0]
  }
  if (parts.some((p) => typeof p === 'string')) {
    return parts
      .map((p) =>
        typeof p === 'string'
          ? p.replace(/;\s*$/, '')
          : Object.entries(p)
              .map(
                ([k, v]) =>
                  `${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${v}`,
              )
              .join(';'),
      )
      .join(';')
  }
  return Object.assign({}, ...parts)
}

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): OctaneAnchorProps
export function useLinkProps(...args: Array<any>): Record<string, any> {
  const [user, slot] = splitSlot(args)
  const options = (user[0] ?? {}) as Record<string, any>
  const router = useRouter()

  const {
    // custom props
    activeProps,
    inactiveProps,
    activeOptions,
    to,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    preloadIntentProximity: _preloadIntentProximity,
    hashScrollIntoView,
    replace,
    startTransition,
    resetScroll,
    viewTransition,
    // element props
    children: _children,
    target,
    disabled,
    style,
    class: klass,
    className,
    onClick,
    onBlur,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ignoreBlocker,
    ref: userRef,
    // consumed by buildLocation — not spread onto the element
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

  // Subscribe to the location (by href) — active state re-derives per commit.
  const currentLocation: any = useStore(
    router.stores.location,
    (l: any) => l,
    (prev: any, next: any) => prev.href === next.href,
    subSlot(slot, 'lp:loc'),
  )

  const next = router.buildLocation({
    _fromLocation: currentLocation,
    ...options,
  } as any)

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

  // External URL detection + dangerous-protocol blocking (javascript:, data:…).
  const externalLink = (() => {
    if (hrefOption?.external) {
      if (isDangerousProtocol(hrefOption.href, router.protocolAllowlist)) {
        return undefined
      }
      return hrefOption.href
    }
    if (isSafeInternal(to)) {
      return undefined
    }
    if (typeof to !== 'string' || to.indexOf(':') === -1) {
      return undefined
    }
    try {
      new URL(to)
      if (isDangerousProtocol(to, router.protocolAllowlist)) {
        return undefined
      }
      return to
    } catch {
      /* not an absolute URL */
    }
    return undefined
  })()

  const isActive = (() => {
    if (externalLink) {
      return false
    }
    if (activeOptions?.exact) {
      if (
        !exactPathTest(currentLocation.pathname, next.pathname, router.basepath)
      ) {
        return false
      }
    } else {
      const currentPathSplit = removeTrailingSlash(
        currentLocation.pathname,
        router.basepath,
      )
      const nextPathSplit = removeTrailingSlash(next.pathname, router.basepath)
      const pathIsFuzzyEqual =
        currentPathSplit.startsWith(nextPathSplit) &&
        (currentPathSplit.length === nextPathSplit.length ||
          currentPathSplit[nextPathSplit.length] === '/')
      if (!pathIsFuzzyEqual) {
        return false
      }
    }
    if (activeOptions?.includeSearch ?? true) {
      const searchTest = deepEqual(currentLocation.search, next.search, {
        partial: !activeOptions?.exact,
        ignoreUndefined: !activeOptions?.explicitUndefined,
      })
      if (!searchTest) {
        return false
      }
    }
    if (activeOptions?.includeHash) {
      return currentLocation.hash === next.hash
    }
    return true
  })()

  const resolvedActiveProps: Record<string, any> = isActive
    ? (functionalUpdate(activeProps, {}) ?? STATIC_ACTIVE_OBJECT)
    : STATIC_EMPTY_OBJECT
  const resolvedInactiveProps: Record<string, any> = isActive
    ? STATIC_EMPTY_OBJECT
    : (functionalUpdate(inactiveProps, {}) ?? STATIC_EMPTY_OBJECT)

  // Class composes clsx-style (octane normalizeClass folds arrays + falsy).
  const resolvedClass = [
    klass ?? className,
    resolvedActiveProps.class ?? resolvedActiveProps.className,
    resolvedInactiveProps.class ?? resolvedInactiveProps.className,
  ].filter(Boolean)
  const resolvedStyle = mergeStyles(
    style,
    resolvedActiveProps.style,
    resolvedInactiveProps.style,
  )

  const [isTransitioning, setIsTransitioning] = useState(
    false,
    subSlot(slot, 'lp:t'),
  )
  const hasRenderFetched = useRef(false, subSlot(slot, 'lp:rf'))
  const elRef = useRef<Element | null>(null, subSlot(slot, 'lp:el'))

  const preload =
    options.reloadDocument || externalLink
      ? false
      : (userPreload ?? router.options.defaultPreload)
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = useCallback(
    () => {
      router
        .preloadRoute({ ...options, _builtLocation: next } as any)
        .catch((err: unknown) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
    },
    [router, next.href],
    subSlot(slot, 'lp:dp'),
  )

  // preload="viewport": preload when the anchor scrolls into view (100px margin).
  useEffect(
    () => {
      if (disabled || preload !== 'viewport') {
        return
      }
      const el = elRef.current
      if (!el || typeof IntersectionObserver === 'undefined') {
        return
      }
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              doPreload()
            }
          }
        },
        { rootMargin: '100px' },
      )
      io.observe(el)
      return () => io.disconnect()
    },
    [disabled, preload, doPreload],
    subSlot(slot, 'lp:io'),
  )

  // preload="render": preload once on mount.
  useEffect(
    () => {
      if (hasRenderFetched.current) {
        return
      }
      if (!disabled && preload === 'render') {
        doPreload()
        hasRenderFetched.current = true
      }
    },
    [disabled, doPreload, preload],
    subSlot(slot, 'lp:pr'),
  )

  const handleClick = (e: MouseEvent) => {
    const elementTarget = (e.currentTarget as Element | null)?.getAttribute?.(
      'target',
    )
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

      router.navigate({
        ...options,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      })
    }
  }

  const captureRef = (el: Element | null) => {
    elRef.current = el
  }
  const composedRef = userRef ? [captureRef, userRef] : captureRef

  if (externalLink) {
    return {
      ...propsSafeToSpread,
      ref: composedRef,
      href: externalLink,
      ...(target !== undefined && { target }),
      ...(disabled !== undefined && { disabled }),
      ...(resolvedStyle !== undefined && { style: resolvedStyle }),
      ...(resolvedClass.length > 0 && { class: resolvedClass }),
      ...(onClick && { onClick }),
      ...(onBlur && { onBlur }),
      ...(onFocus && { onFocus }),
      ...(onMouseEnter && { onMouseEnter }),
      ...(onMouseLeave && { onMouseLeave }),
      ...(onTouchStart && { onTouchStart }),
    }
  }

  const enqueueIntentPreload = (e: MouseEvent | FocusEvent) => {
    if (disabled || preload !== 'intent') {
      return
    }
    if (!preloadDelay) {
      doPreload()
      return
    }
    const eventTarget = e.currentTarget as EventTarget
    if (timeoutMap.has(eventTarget)) {
      return
    }
    const id = setTimeout(() => {
      timeoutMap.delete(eventTarget)
      doPreload()
    }, preloadDelay)
    timeoutMap.set(eventTarget, id)
  }

  const handleTouchStart = () => {
    if (disabled || preload !== 'intent') {
      return
    }
    doPreload()
  }

  const handleLeave = (e: MouseEvent | FocusEvent) => {
    if (disabled || !preload || !preloadDelay) {
      return
    }
    const eventTarget = e.currentTarget as EventTarget
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
    ref: composedRef,
    onClick: composeHandlers([onClick, handleClick]),
    onBlur: composeHandlers([onBlur, handleLeave]),
    onFocus: composeHandlers([onFocus, enqueueIntentPreload]),
    onMouseEnter: composeHandlers([onMouseEnter, enqueueIntentPreload]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    disabled: !!disabled,
    ...(target !== undefined && { target }),
    ...(resolvedStyle !== undefined && { style: resolvedStyle }),
    ...(resolvedClass.length > 0 && { class: resolvedClass }),
    ...(disabled && STATIC_DISABLED_PROPS),
    ...(isActive && STATIC_ACTIVE_PROPS),
    ...(isTransitioning && STATIC_TRANSITIONING_PROPS),
  }
}

// Wrap a design-system component so it navigates like <Link> — the component
// receives the fully-built link props (href, handlers, data-status, …).
export function createLink<const TComp extends ComponentBody<never>>(
  Comp: TComp,
): LinkComponent<TComp>
export function createLink(Comp: any): any {
  return function CreatedLink(props: any) {
    return createElement(Link as any, { ...props, _asChild: Comp })
  }
}

// Identity helper for pre-validating navigation options (type-level upstream).
export type LinkOptionsFnOptions<
  TOptions,
  TComp,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<unknown>
    ? ValidateLinkOptionsArray<TRouter, TOptions, string, TComp>
    : ValidateLinkOptions<TRouter, TOptions, string, TComp>

export type LinkOptionsFn<TComp> = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions

export function linkOptions<
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(options: LinkOptionsFnOptions<TOptions, 'a', TRouter>): TOptions
export function linkOptions(options: unknown): unknown {
  return options
}
