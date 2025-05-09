import * as Solid from 'solid-js'

import { mergeRefs } from '@solid-primitives/refs'

import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { Dynamic } from 'solid-js/web'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'

import { useIntersectionObserver } from './utils'

import { useMatches } from './Matches'
import type {
  AnyRouter,
  Constrain,
  LinkCurrentTargetElement,
  LinkOptions,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Solid.ComponentProps<'a'> {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = Solid.createSignal(false)
  let hasRenderFetched = false

  const innerRef: Element | null = null

  const [local, rest] = Solid.splitProps(
    Solid.mergeProps(
      {
        activeProps: () => ({ class: 'active' }),
        inactiveProps: () => ({}),
      },
      options,
    ),
    [
      'activeProps',
      'inactiveProps',
      'activeOptions',
      'to',
      'preload',
      'preloadDelay',
      'preloadIntentProximity',
      'hashScrollIntoView',
      'replace',
      'startTransition',
      'resetScroll',
      'viewTransition',
      'children',
      'target',
      'disabled',
      'style',
      'class',
      'onClick',
      'onFocus',
      'onMouseEnter',
      'onMouseLeave',
      'onMouseOver',
      'onMouseOut',
      'onTouchStart',
      'ignoreBlocker',
    ],
  )

  // const {
  //   // custom props
  //   activeProps = () => ({ class: 'active' }),
  //   inactiveProps = () => ({}),
  //   activeOptions,
  //   to,
  //   preload: userPreload,
  //   preloadDelay: userPreloadDelay,
  //   hashScrollIntoView,
  //   replace,
  //   startTransition,
  //   resetScroll,
  //   viewTransition,
  //   // element props
  //   children,
  //   target,
  //   disabled,
  //   style,
  //   class,
  //   onClick,
  //   onFocus,
  //   onMouseEnter,
  //   onMouseLeave,
  //   onTouchStart,
  //   ignoreBlocker,
  //   ...rest
  // } = options

  const [_, propsSafeToSpread] = Solid.splitProps(rest, [
    'params',
    'search',
    'hash',
    'state',
    'mask',
    'reloadDocument',
  ])

  // If this link simply reloads the current route,
  // make sure it has a new key so it will trigger a data refresh

  // If this `to` is a valid external URL, return
  // null for LinkUtils

  const type: Solid.Accessor<'internal' | 'external'> = () => {
    try {
      new URL(`${local.to}`)
      return 'external'
    } catch {}
    return 'internal'
  }

  const currentSearch = useRouterState({
    select: (s) => s.location.searchStr,
  })

  // when `from` is not supplied, use the leaf route of the current matches as the `from` location
  // so relative routing works as expected
  const from = useMatches({
    select: (matches) => options.from ?? matches[matches.length - 1]?.fullPath,
  })

  const _options = () => ({
    ...options,
    from: from(),
  })

  const next = Solid.createMemo(() => {
    currentSearch()
    return router.buildLocation(_options() as any)
  })

  const preload = Solid.createMemo(() => {
    if (_options().reloadDocument) {
      return false
    }
    return local.preload ?? router.options.defaultPreload
  })

  const preloadMemo: () => { preload: any; preloadIntentProximity: any } =
    Solid.createMemo(() => {
      if (_options().reloadDocument) {
        return { preload: false, preloadIntentProximity: 0 }
      }
      return {
        preload: local.preload ?? router.options.defaultPreload,
        preloadIntentProximity:
          local.preloadIntentProximity ??
          router.options.defaultPreloadIntentProximity ??
          0,
      } as const
    })

  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      if (local.activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next().pathname,
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
          next().pathname,
          router.basepath,
        ).split('/')

        const pathIsFuzzyEqual = nextPathSplit.every(
          (d, i) => d === currentPathSplit[i],
        )
        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (local.activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next().search, {
          partial: !local.activeOptions?.exact,
          ignoreUndefined: !local.activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (local.activeOptions?.includeHash) {
        return s.location.hash === next().hash
      }
      return true
    },
  })

  const doPreload = () =>
    router.preloadRoute(_options() as any).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })

  let timeoutIdRef: any = null
  let hasPreloadedRef = false

  const tryPreload = () => {
    if (hasPreloadedRef || timeoutIdRef) {
      return
    }

    timeoutIdRef = setTimeout(() => {
      doPreload()
      hasPreloadedRef = true
      timeoutIdRef = null
    }, preloadDelay())
  }

  const cancelPreload = () => {
    if (timeoutIdRef) {
      clearTimeout(timeoutIdRef)
      timeoutIdRef = null
    }
  }

  let isIntersectingRef = false

  const shouldUseIntersectionObserver = Solid.createMemo(() => {
    return (
      !local.disabled &&
      (preload() === 'viewport' ||
        (preload() === 'intent' && preloadMemo().preloadIntentProximity() > 0))
    )
  })

  const preloadViewportIoCallback = (
    entry: IntersectionObserverEntry | undefined,
  ) => {
    isIntersectingRef = entry?.isIntersecting ?? false

    if (isIntersectingRef && preloadMemo().preload === 'viewport') {
      doPreload()
    }
  }

  const [ref, setRef] = Solid.createSignal<Element | null>(null)

  useIntersectionObserver(
    ref,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    { disabled: !shouldUseIntersectionObserver() || !!local.disabled || !(preload() === 'viewport') },
  )

  Solid.createEffect(() => {
    if (hasRenderFetched) {
      return
    }
    if (!local.disabled && preload() === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })


  let rectRef: Rect | null = null;


  Solid.createEffect(() => {
    if (
      type() === 'internal' &&
      preloadMemo().preload === 'intent' &&
      preloadMemo().preloadIntentProximity > 0 &&
      local.disabled &&
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      !innerRef
    ) {
      return
    }

    let lastMousePosition: {
      x: number
      y: number
    } | null = null

    let frameId: number | null = null

    const handleMousePos = (pairs: Array<{ x: number; y: number }>) => {
      if (!isIntersectingRef || frameId) return

      frameId = requestAnimationFrame(() => {
        // If one of pairs is within the preloadIntentProximity
        // stop the loop
        pairs.some(({ x, y }, i) => {
          if (!rectRef) return

          // Calculate the distance to the nearest edge of the bounding box
          const dx = Math.max(
            rectRef.left - x,
            0,
            x - rectRef.right,
          )
          const dy = Math.max(
            rectRef.top - y,
            0,
            y - rectRef.bottom,
          )

          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance <= preloadMemo().preloadIntentProximity) {
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
  })

  useRectCallback(innerRef, (rect) => {
    rectRef = rect
  })

  let pointerDownRef = false

  if (type() === 'external') {
    return Solid.mergeProps(
      propsSafeToSpread,
      {
        ref,
        get type() {
          return type()
        },
        get href() {
          return local.to
        },
      },
      Solid.splitProps(local, [
        'children',
        'target',
        'disabled',
        'style',
        'class',
        'onClick',
        'onFocus',
        'onMouseEnter',
        'onMouseLeave',
        'onMouseOut',
        'onMouseOver',
        'onTouchStart',
      ])[0],
    ) as any
  }

  // The click handler
  const handleClick = (e: MouseEvent) => {
    if (
      !local.disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!local.target || local.target === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()

      setIsTransitioning(true)

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        setIsTransitioning(false)
      })

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      return router.navigate({
        ..._options(),
        replace: local.replace,
        resetScroll: local.resetScroll,
        hashScrollIntoView: local.hashScrollIntoView,
        startTransition: local.startTransition,
        viewTransition: local.viewTransition,
        ignoreBlocker: local.ignoreBlocker,
      } as any)
    }
  }

  
  const onPointerDown = (e: PointerEvent) => {
    pointerDownRef = true
  }
  
  const onPointerUp = (e: PointerEvent) => {
    pointerDownRef = false
  }

  // The click handler
  const handleFocus = (_: MouseEvent) => {
    if (local.disabled || pointerDownRef) return
    if (preload()) {
      doPreload()
    }
  }



  const handleMouseEnter = () => {
    if (
      preloadMemo().preload === 'intent' &&
      preloadMemo().preloadIntentProximity <= 0
    ) {
      tryPreload()
    }
  }

  const handleMouseLeave = () => {
    if (
      preloadMemo().preload === 'intent' &&
      preloadMemo().preloadIntentProximity <= 0
    ) {
      cancelPreload()
    }
  }

  const handleTouchStart = handleFocus

  const handleEnter = (e: MouseEvent) => {
    if (local.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (preload()) {
      if (eventTarget.preloadTimeout) {
        return
      }

      eventTarget.preloadTimeout = setTimeout(() => {
        eventTarget.preloadTimeout = null
        doPreload()
      }, preloadDelay())
    }
  }

  const handleLeave = (e: MouseEvent) => {
    if (local.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (eventTarget.preloadTimeout) {
      clearTimeout(eventTarget.preloadTimeout)
      eventTarget.preloadTimeout = null
    }
  }

  /** Call a JSX.EventHandlerUnion with the event. */
  function callHandler<T, TEvent extends Event>(
    event: TEvent & { currentTarget: T; target: Element },
    handler: Solid.JSX.EventHandlerUnion<T, TEvent> | undefined,
  ) {
    if (handler) {
      if (typeof handler === 'function') {
        handler(event)
      } else {
        handler[0](handler[1], event)
      }
    }

    return event.defaultPrevented
  }

  function composeEventHandlers<T>(
    handlers: Array<Solid.JSX.EventHandlerUnion<T, any> | undefined>,
  ) {
    return (event: any) => {
      for (const handler of handlers) {
        callHandler(event, handler)
      }
    }
  }

  // Get the active props
  const resolvedActiveProps: () => Omit<Solid.ComponentProps<'a'>, 'style'> & {
    style?: Solid.JSX.CSSProperties
  } = () =>
    isActive() ? (functionalUpdate(local.activeProps as any, {}) ?? {}) : {}

  // Get the inactive props
  const resolvedInactiveProps: () => Omit<
    Solid.ComponentProps<'a'>,
    'style'
  > & { style?: Solid.JSX.CSSProperties } = () =>
    isActive() ? {} : functionalUpdate(local.inactiveProps, {})

  const resolvedClassName = () =>
    [local.class, resolvedActiveProps().class, resolvedInactiveProps().class]
      .filter(Boolean)
      .join(' ')

  const resolvedStyle = () => ({
    ...local.style,
    ...resolvedActiveProps().style,
    ...resolvedInactiveProps().style,
  })

  const href = Solid.createMemo(() => {
    const nextLocation = next()
    const maskedLocation = nextLocation.maskedLocation

    return _options().disabled
      ? undefined
      : maskedLocation
        ? router.history.createHref(maskedLocation.href)
        : router.history.createHref(nextLocation.href)
  })

  return Solid.mergeProps(
    propsSafeToSpread,
    resolvedActiveProps,
    resolvedInactiveProps,
    () => {
      return {
        href: href(),
        ref: mergeRefs(setRef, _options().ref),
        onClick: composeEventHandlers([local.onClick, handleClick]),
        onFocus: composeEventHandlers([local.onFocus, handleFocus]),
        onMouseEnter: composeEventHandlers([local.onMouseEnter, handleMouseEnter]),
        onMouseOver: composeEventHandlers([local.onMouseOver, handleEnter]),
        onMouseLeave: composeEventHandlers([local.onMouseLeave, handleMouseLeave]),
        onMouseOut: composeEventHandlers([local.onMouseOut, handleLeave]),
        onTouchStart: composeEventHandlers([
          local.onTouchStart,
          handleTouchStart,
        ]),
        onPointerDown: composeEventHandlers([onPointerDown]),
        onPointerUp: composeEventHandlers([onPointerUp]),
        disabled: !!local.disabled,
        target: local.target,
        ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
        ...(resolvedClassName() && { class: resolvedClassName() }),
        ...(local.disabled && {
          role: 'link',
          'aria-disabled': true,
        }),
        ...(isActive() && { 'data-status': 'active', 'aria-current': 'page' }),
        ...(isTransitioning() && { 'data-transitioning': 'transitioning' }),
      }
    },
  ) as any

}

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  Omit<Solid.ComponentProps<'a'>, 'style'> & { style?: Solid.JSX.CSSProperties }

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
  LinkComponentSolidProps<TComp> & {
    [key: `data-${string}`]: unknown
  }
>

export interface ActiveLinkOptionProps<TComp = 'a'> {
  /**
   * A function that returns additional props for the `active` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `class`'s are concatenated)
   */
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  /**
   * A function that returns additional props for the `inactive` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `class`'s are concatenated)
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
    | Solid.JSX.Element
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => Solid.JSX.Element)
}

type LinkComponentSolidProps<TComp> = TComp extends Solid.ValidComponent
  ? Omit<Solid.ComponentProps<TComp>, keyof CreateLinkProps>
  : never

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentSolidProps<TComp> &
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
) => Solid.JSX.Element

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
  ): Solid.JSX.Element
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Solid.JSX.Element>,
): LinkComponent<TComp> {
  return (props) => <Link {...(props as any)} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props: any) => {
  const [local, rest] = Solid.splitProps(props, ['_asChild'])

  const [_, linkProps] = Solid.splitProps(
    useLinkProps(rest as unknown as any),
    ['type', 'children'],
  )

  const children = () =>
    typeof rest.children === 'function'
      ? rest.children({
          get isActive() {
            return (linkProps as any)['data-status'] === 'active'
          },
        })
      : rest.children

  return (
    <Dynamic component={local._asChild ? local._asChild : 'a'} {...linkProps}>
      {children}
    </Dynamic>
  )
}

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
  ref: Element | null,
  onSizeChange: (rect: Rect) => void,
) => {
  const handleResize = () => {
    if (!ref) {
      return
    }

    // Update client rect
    const newRect = getRect(ref)
    onSizeChange(newRect)
  }

  Solid.createEffect(() => {
    const element = ref
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
  }, [ref, handleResize])
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
