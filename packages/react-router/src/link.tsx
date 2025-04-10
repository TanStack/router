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

import {
  useForwardedRef,
  useIntersectionObserver,
  useLayoutEffect,
} from './utils'

import { useMatches } from './Matches'
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
    activeProps = () => ({ className: 'active' }),
    inactiveProps = () => ({}),
    activeOptions,
    to,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    preloadIntentProximity: userPreloadIntentProximity,
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
    ...rest
  } = options

  const {
    // prevent these from being returned
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    reloadDocument: _reloadDocument,
    ...propsSafeToSpread
  } = rest

  // If this link simply reloads the current route,
  // make sure it has a new key so it will trigger a data refresh

  // If this `to` is a valid external URL, return
  // null for LinkUtils

  const type: 'internal' | 'external' = React.useMemo(() => {
    try {
      new URL(`${to}`)
      return 'external'
    } catch {}
    return 'internal'
  }, [to])

  // subscribe to search params to re-build location if it changes
  const currentSearch = useRouterState({
    select: (s) => s.location.search,
    structuralSharing: true as any,
  })

  // when `from` is not supplied, use the leaf route of the current matches as the `from` location
  // so relative routing works as expected
  const from = useMatches({
    select: (matches) => options.from ?? matches[matches.length - 1]?.fullPath,
  })
  // Use it as the default `from` location
  const _options = React.useMemo(() => ({ ...options, from }), [options, from])

  const next = React.useMemo(
    () => router.buildLocation(_options as any),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, _options, currentSearch],
  )

  const [preload, preloadIntentProximity] = React.useMemo(() => {
    if (_options.reloadDocument) {
      return [false, 0]
    }
    return [
      userPreload ?? router.options.defaultPreload,
      userPreloadIntentProximity ??
        router.options.defaultPreloadIntentProximity ??
        0,
    ] as const
  }, [router.options.defaultPreload, userPreload, _options.reloadDocument])

  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
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
        ).split('/')
        const nextPathSplit = removeTrailingSlash(
          next.pathname,
          router.basepath,
        ).split('/')

        const pathIsFuzzyEqual = nextPathSplit.every(
          (d, i) => d === currentPathSplit[i],
        )
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
    router.preloadRoute(_options as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
    // NOTE: Use this to debug preloading!
    // .then(() => {
    //   // @ts-expect-error
    //   innerRef.current.style.boxShadow = '0 0 10px 0 rgba(255, 0, 0, 0.5)'
    // })
  }, [_options, router])

  const timeoutIdRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasPreloadedRef = React.useRef(false)

  const tryPreload = React.useCallback(() => {
    if (hasPreloadedRef.current || timeoutIdRef.current) {
      return
    }

    timeoutIdRef.current = setTimeout(() => {
      doPreload()
      hasPreloadedRef.current = true
      timeoutIdRef.current = null
    }, preloadDelay)
  }, [preloadDelay, doPreload])

  const cancelPreload = React.useCallback(() => {
    if (timeoutIdRef.current) {
      clearTimeout(timeoutIdRef.current)
      timeoutIdRef.current = null
    }
  }, [])

  const isIntersectingRef = React.useRef(false)

  const shouldUseIntersectionObserver = React.useMemo(() => {
    return (
      !disabled &&
      (preload === 'viewport' ||
        (preload === 'intent' && preloadIntentProximity > 0))
    )
  }, [preload, preloadIntentProximity, disabled])

  const preloadViewportIoCallback = React.useCallback(
    (entry: IntersectionObserverEntry | undefined) => {
      isIntersectingRef.current = entry?.isIntersecting ?? false

      if (isIntersectingRef.current && preload === 'viewport') {
        doPreload()
      }
    },
    [doPreload],
  )

  useIntersectionObserver(
    innerRef,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    {
      disabled: !shouldUseIntersectionObserver,
    },
  )

  useLayoutEffect(() => {
    if (hasRenderFetched.current) {
      return
    }
    if (!disabled && preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [disabled, doPreload, preload])

  const rectRef = React.useRef<Rect>(null)

  useLayoutEffect(() => {
    if (
      type === 'internal' &&
      preload === 'intent' &&
      preloadIntentProximity > 0 &&
      disabled &&
      !innerRef.current
    ) {
      return
    }

    let lastMousePosition: {
      x: number
      y: number
    } | null = null

    let frameId: number | null = null

    const handleMousePos = (pairs: Array<{ x: number; y: number }>) => {
      if (!isIntersectingRef.current || frameId) return

      frameId = requestAnimationFrame(() => {
        // If one of pairs is within the preloadIntentProximity
        // stop the loop
        pairs.some(({ x, y }, i) => {
          if (!rectRef.current) return

          // Calculate the distance to the nearest edge of the bounding box
          const dx = Math.max(
            rectRef.current.left - x,
            0,
            x - rectRef.current.right,
          )
          const dy = Math.max(
            rectRef.current.top - y,
            0,
            y - rectRef.current.bottom,
          )

          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance <= preloadIntentProximity) {
            tryPreload()
            return true
          } else {
            return false
          }
        })

        frameId = null
      })
    }

    const handleScroll = () => {
      if (!lastMousePosition) return
      handleMousePos([{ x: lastMousePosition.x, y: lastMousePosition.y }])
    }

    const handlePointerMove = (e: PointerEvent) => {
      lastMousePosition = {
        x: e.clientX,
        y: e.clientY,
      }
      if ((e as any).getPredictedEvents) {
        const events = e.getPredictedEvents()
        handleMousePos([
          {
            x: e.clientX,
            y: e.clientY,
          },
          ...events.map((event) => ({
            x: event.clientX,
            y: event.clientY,
          })),
        ])
      }
    }

    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      document.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('scroll', handleScroll)
      cancelPreload()
    }
  }, [disabled, doPreload, preload, preloadDelay, preloadIntentProximity])

  useRectCallback(innerRef, (rect) => {
    rectRef.current = rect
  })

  if (type === 'external') {
    return {
      ...propsSafeToSpread,
      ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
      type,
      href: to,
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
  const handleClick = (e: MouseEvent) => {
    if (
      !disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!target || target === '_self') &&
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
      return router.navigate({
        ..._options,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      } as any)
    }
  }

  // The click handler
  const handleFocus = (_: MouseEvent) => {
    if (disabled) return
    if (preload) {
      doPreload()
    }
  }

  const handleMouseEnter = () => {
    if (preload === 'intent' && preloadIntentProximity <= 0) {
      tryPreload()
    }
  }

  const handleMouseLeave = () => {
    if (preload === 'intent' && preloadIntentProximity <= 0) {
      cancelPreload()
    }
  }

  const handleTouchStart = handleFocus

  const composeHandlers =
    (handlers: Array<undefined | ((e: any) => void)>) =>
    (e: { persist?: () => void; defaultPrevented: boolean }) => {
      e.persist?.()
      handlers.filter(Boolean).forEach((handler) => {
        if (e.defaultPrevented) return
        handler!(e)
      })
    }

  // Get the active props
  const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> = isActive
    ? (functionalUpdate(activeProps as any, {}) ?? {})
    : {}

  // Get the inactive props
  const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
    isActive ? {} : functionalUpdate(inactiveProps, {})

  const resolvedClassName = [
    className,
    resolvedActiveProps.className,
    resolvedInactiveProps.className,
  ]
    .filter(Boolean)
    .join(' ')

  const resolvedStyle = {
    ...style,
    ...resolvedActiveProps.style,
    ...resolvedInactiveProps.style,
  }

  return {
    ...propsSafeToSpread,
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href: disabled
      ? undefined
      : next.maskedLocation
        ? router.history.createHref(next.maskedLocation.href)
        : router.history.createHref(next.href),
    ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
    onClick: composeHandlers([onClick, handleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleMouseEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleMouseLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    disabled: !!disabled,
    target,
    ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(disabled && {
      role: 'link',
      'aria-disabled': true,
    }),
    ...(isActive && { 'data-status': 'active', 'aria-current': 'page' }),
    ...(isTransitioning && { 'data-transitioning': 'transitioning' }),
  }
}

type UseLinkReactProps<TComp> = TComp extends keyof React.JSX.IntrinsicElements
  ? React.JSX.IntrinsicElements[TComp]
  : React.PropsWithoutRef<
      TComp extends React.ComponentType<infer TProps> ? TProps : never
    > &
      React.RefAttributes<
        TComp extends
          | React.FC<{ ref: infer TRef }>
          | React.Component<{ ref: infer TRef }>
          ? TRef
          : never
      >

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

export type LinkComponent<TComp> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => React.ReactElement

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => ReactNode>,
): LinkComponent<TComp> {
  return React.forwardRef(function CreatedLink(props, ref) {
    return <Link {...(props as any)} _asChild={Comp} ref={ref} />
  }) as any
}

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

    if (typeof _asChild === 'undefined') {
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

export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}

export const useRectCallback = (
  ref: React.RefObject<Element | null>,
  onSizeChange: (rect: Rect) => void,
) => {
  const handleResize = React.useCallback(() => {
    if (!ref.current) {
      return
    }

    // Update client rect
    const newRect = getRect(ref.current)
    onSizeChange(newRect)
  }, [ref, onSizeChange])

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    handleResize()

    if (typeof ResizeObserver === 'function') {
      const resizeObserver = new ResizeObserver(() => handleResize())
      resizeObserver.observe(element)

      return () => {
        resizeObserver.disconnect()
      }
    } else {
      // Browser support, remove freely
      window.addEventListener('resize', handleResize)

      return () => {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [ref.current, handleResize])
}

type Rect = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

function getRect(element: Element | null): Rect {
  if (!element) {
    return {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
    }
  }

  return element.getBoundingClientRect()
}
