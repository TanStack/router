import * as Solid from 'solid-js'

import {
  _isRouteDeparting,
  deepEqual,
  functionalUpdate,
  getUrlScheme,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from '@solidjs/web'
import { useRouter } from './useRouter'
import { nearestMatchContext } from './matchContext'

import { useIntersectionObserver } from './utils'

import { useHydrated } from './ClientOnly'
import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  ParsedLocation,
  RegisteredRouter,
  RoutePaths,
} from '@tanstack/router-core'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'
import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web'

function mergeRefs<T>(...refs: Array<unknown>): (el: T) => void {
  const setRef = (ref: unknown, el: T) => {
    if (typeof ref === 'function') {
      ref(el)
    } else if (Array.isArray(ref)) {
      for (const nestedRef of ref) {
        setRef(nestedRef, el)
      }
    }
  }

  return (el: T) => {
    for (const ref of refs) {
      setRef(ref, el)
    }
  }
}

function splitProps<T extends Record<string, any>, TKey extends keyof T>(
  props: T,
  keys: ReadonlyArray<TKey>,
): [Pick<T, TKey>, Omit<T, TKey>] {
  const _local = {} as Pick<T, TKey>
  const _rest = {} as Omit<T, TKey>

  // A safe way to polyfill splitProps if native getter copy is too complex
  // is just to return [props, Solid.omit(props, keys)] but it modifies typing.
  // Actually, Solid.omit exists!
  // Note: Solid.omit uses rest params (...keys), so we must spread the array.
  return [props as any, Solid.omit(props, ...(keys as any)) as any]
}
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): ComponentProps<'a'> {
  const router = useRouter()
  if (isServer ?? router.isServer) {
    return serverLinkProps(router, options, LINK_OPTION_KEY_SET)
  }
  const shouldHydrateHash = !isServer && !!router.options.ssr
  const hasHydrated = useHydrated()

  let hasRenderFetched = false

  const local = options

  const propsSafeToSpread: Record<string, any> = Solid.omit(
    options as Record<string, any>,
    ...LINK_OPTION_KEYS,
  )

  // A live match never changes route, so read it once without tracking.
  const routeId = Solid.untrack(Solid.useContext(nearestMatchContext)[0])

  // While a publishing navigation leaves the Link's route, keep the location
  // the route still presents so the Link does no work. The route unmounts
  // when that navigation commits, and any other outcome publishes a newer
  // location. Compare by identity: a same-href navigation can change state.
  let holding = false
  const currentLocation = Solid.createMemo((prev?: ParsedLocation) => {
    const location = router.stores.location.get()
    holding = !!prev && !!_isRouteDeparting(router, routeId, location)
    return holding ? prev! : location
  })

  // The Link's own destination options, replaced only when a destination prop
  // changes: the router reuses a location built from the same object without
  // reading the current location. A Solid store changes in place, so a store
  // prop value (checked one level deep, not nested) gets a fresh object per
  // location instead, re-reading the store at each navigation as before. A
  // mask holds destination options of its own, so its values are checked too.
  const dest = Solid.createMemo(
    () => {
      const dest: any = {}
      for (const key of NAVIGATION_KEYS) {
        const value = (dest[key] = (options as any)[key])
        if (
          isStore(value) ||
          (key === 'mask' && value && Object.values(value).some(isStore))
        ) {
          currentLocation()
        }
      }
      return dest
    },
    { lazy: true },
  )

  // Everything the Link derives from its destination and the location, in
  // one computation: [element href, external href (null when blocked),
  // active]. An unchanged result keeps its identity, so a navigation that
  // leaves the Link as it was notifies nothing downstream.
  const linkState = Solid.createMemo(
    (prev?: LinkState): LinkState =>
      computeLinkState(
        router,
        local,
        currentLocation(),
        dest,
        shouldHydrateHash,
        hasHydrated,
        prev,
      ),
    { lazy: true },
  )

  const preload = Solid.createMemo(
    () => {
      if (
        local.reloadDocument ||
        linkState()[1 /* external */] !== undefined ||
        local.disabled
      ) {
        return false
      }
      return local.preload ?? router.options.defaultPreload
    },
    { lazy: true },
  )
  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  // A Link holding its departing route's location goes where its href points.
  // Otherwise a held Solid 2 transition can leave it on a stale location, so
  // build from the router's.
  const navigationOptions = () => {
    const options_ = Solid.untrack(dest)
    return holding ? options_ : { ...options_, _fromLocation: undefined }
  }

  const doPreload = () =>
    router.preloadRoute(navigationOptions()).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })

  const [ref, setRefSignal] = Solid.createSignal<Element | null>(null)

  const setRef = (el: Element | null) => {
    Solid.runWithOwner(null, () => {
      setRefSignal(el)
    })
  }

  let preloadTimeout: ReturnType<typeof setTimeout> | undefined
  const cancelPreload = () => {
    clearTimeout(preloadTimeout)
    preloadTimeout = undefined
  }

  const enqueuePreload = (
    e?: MouseEvent | FocusEvent | IntersectionObserverEntry,
  ) => {
    if (!e) {
      cancelPreload()
      return
    }

    if (
      !(
        (e as IntersectionObserverEntry).isIntersecting ??
        preload() === 'intent'
      )
    ) {
      if ((e as IntersectionObserverEntry).isIntersecting === false) {
        cancelPreload()
      }
      return
    }

    if (!preloadDelay()) {
      doPreload()
      return
    }

    preloadTimeout ??= setTimeout(() => {
      preloadTimeout = undefined
      doPreload()
    }, preloadDelay())
  }

  useIntersectionObserver(ref, enqueuePreload, preload)

  Solid.createEffect(preload, (preloadValue) => {
    if (hasRenderFetched) {
      return
    }
    if (preloadValue === 'render') {
      Solid.untrack(() => doPreload())
      hasRenderFetched = true
    }
  })

  // The click handler
  const handleClick = (e: MouseEvent) => {
    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const effectiveTarget =
      local.target !== undefined ? local.target : elementTarget

    if (
      !local.disabled &&
      linkState()[1 /* external */] === undefined &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      cancelPreload()

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate(navigationOptions())
    }
  }

  const handleTouchStart = () => {
    if (preload() !== 'intent') return
    doPreload()
  }

  const handleLeave = () => {
    if (preload() === 'intent') {
      cancelPreload()
    }
  }

  const onClick = createComposedHandler(() => local.onClick, handleClick)
  const onBlur = createComposedHandler(() => local.onBlur, handleLeave)
  const onFocus = createComposedHandler(() => local.onFocus, enqueuePreload)
  const onMouseEnter = createComposedHandler(
    () => local.onMouseEnter,
    enqueuePreload,
  )
  const onMouseOver = createComposedHandler(
    () => local.onMouseOver,
    enqueuePreload,
  )
  const onMouseLeave = createComposedHandler(
    () => local.onMouseLeave,
    handleLeave,
  )
  const onMouseOut = createComposedHandler(() => local.onMouseOut, handleLeave)
  const onTouchStart = createComposedHandler(
    () => local.onTouchStart,
    handleTouchStart,
  )

  type ResolvedLinkStateProps = Omit<ComponentProps<'a'>, 'style'> & {
    style?: JSX.CSSProperties
  }

  const resolveLinkStateProps = (): ResolvedLinkStateProps => {
    const [href, external, active] = linkState()
    const disabled = !!local.disabled || external === null
    // Solid does not delegate mouseenter/mouseleave/focus/blur, so composed
    // intent handlers would install real listeners on every anchor. Without
    // intent preloading they only forward, so the user's handler goes as is.
    const intent = preload() === 'intent'
    const base: Record<string, any> = {
      onClick,
      onBlur: intent ? onBlur : local.onBlur,
      onFocus: intent ? onFocus : local.onFocus,
      onMouseEnter: intent ? onMouseEnter : local.onMouseEnter,
      onMouseOver: intent ? onMouseOver : local.onMouseOver,
      onMouseLeave: intent ? onMouseLeave : local.onMouseLeave,
      onMouseOut: intent ? onMouseOut : local.onMouseOut,
      onTouchStart: intent ? onTouchStart : local.onTouchStart,
      href,
      disabled,
      target: local.target,
    }
    return withStateProps(base, local, active) as ResolvedLinkStateProps
  }

  // `merge` memoizes this itself; the ref reads its latest result.
  let resolved: ResolvedLinkStateProps | undefined
  const resolvedProps = () => (resolved = resolveLinkStateProps())

  // One ref callback per element. The selected state props' ref, else the
  // Link's own, receives the element once; a state change does not re-call it.
  const linkRef = mergeRefs(setRef, (el: Element) => {
    mergeRefs(Solid.untrack(() => resolved?.ref ?? local.ref))(el)
  })

  return Solid.merge(propsSafeToSpread, resolvedProps, {
    ref: linkRef,
  }) as any
}

// Owners the client's useLinkProps creates; link-hydration-ids.test.tsx checks it.
const CLIENT_LINK_PROPS_OWNERS = 8

// The server reads each value once, so it builds plain props without owners.
function serverLinkProps(
  router: AnyRouter,
  props: Record<string, any>,
  skip: ReadonlySet<string>,
): Record<string, any> {
  const location = router.stores.location.get()
  const [href, external, active] = computeLinkState(
    router,
    props,
    location,
    () => {
      const dest: any = {}
      for (const key of NAVIGATION_KEYS) {
        dest[key] = props[key]
      }
      return dest
    },
    !isServer && !!router.options.ssr,
    NOT_HYDRATED,
  )
  if (Solid.getOwner()?.id != null) {
    for (let i = 1; i < CLIENT_LINK_PROPS_OWNERS; i++) {
      Solid.createUniqueId()
    }
  }
  // The last owner is merge's memo, where the client evaluates state props.
  const resolved = Solid.createRoot(() =>
    withStateProps(
      {
        // Custom link components still receive the caller's handlers.
        onClick: props.onClick,
        onBlur: props.onBlur,
        onFocus: props.onFocus,
        onMouseEnter: props.onMouseEnter,
        onMouseOver: props.onMouseOver,
        onMouseLeave: props.onMouseLeave,
        onMouseOut: props.onMouseOut,
        onTouchStart: props.onTouchStart,
        href,
        disabled: !!props.disabled || external === null,
        target: props.target,
      },
      props,
      active,
    ),
  )
  // Keys in merge's order: element props, then the resolved ones that win.
  const linkProps: Record<string, any> = {}
  const proxied = Solid.$PROXY in props
  for (const key of Object.keys(props)) {
    if (skip.has(key) || key in resolved) {
      continue
    }
    // A getter stays lazy, as it was behind merge, for whoever renders it.
    if (proxied || Object.getOwnPropertyDescriptor(props, key)!.get) {
      Object.defineProperty(linkProps, key, {
        get: () => props[key],
        enumerable: true,
        configurable: true,
      })
    } else {
      linkProps[key] = props[key]
    }
  }
  return Object.assign(linkProps, resolved)
}

function withStateProps(
  base: Record<string, any>,
  local: Record<string, any>,
  active: boolean,
): Record<string, any> {
  if (base.disabled) {
    Object.assign(base, STATIC_DISABLED_PROPS)
  }

  if (
    local.activeProps === undefined &&
    local.inactiveProps === undefined &&
    local.class === undefined &&
    local.style === undefined
  ) {
    return active ? Object.assign(base, STATIC_DEFAULT_ACTIVE_ATTRIBUTES) : base
  }

  const stateProps: Record<string, any> =
    functionalUpdate(
      (active ? local.activeProps : local.inactiveProps) ??
        (active ? STATIC_ACTIVE_PROPS : EMPTY_OBJECT),
      {},
    ) ?? EMPTY_OBJECT
  const baseStyle = local.style
  const stateStyle = stateProps.style
  // Snapshot reactive style properties so in-place updates remain observable.
  const style =
    baseStyle || stateStyle ? { ...baseStyle, ...stateStyle } : undefined
  const baseClass = local.class
  const stateClass = stateProps.class
  const className = baseClass
    ? stateClass
      ? `${baseClass} ${stateClass}`
      : baseClass
    : stateClass

  return {
    ...base,
    ...stateProps,
    // State props can override element props, but not routing options.
    href: base.href,
    disabled: base.disabled,
    target: base.target,
    ...(style && hasKeys(style) && { style }),
    ...(className && { class: className }),
    ...(active && STATIC_ACTIVE_ATTRIBUTES),
  }
}

function computeLinkState(
  router: AnyRouter,
  local: Record<string, any>,
  location: ParsedLocation,
  dest: () => any,
  shouldHydrateHash: boolean,
  hasHydrated: () => boolean,
  prev?: LinkState,
): LinkState {
  const to = local.to
  const disabled = local.disabled
  const scheme = typeof to === 'string' && getUrlScheme(to)
  let href: string | undefined
  let external: string | null | undefined
  let active = false
  if (scheme) {
    if (router.protocolAllowlist.has(scheme)) {
      external = to
    } else {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Blocked Link with dangerous protocol: ${to}`)
      }
      external = null
    }
  } else {
    const options_ = dest()
    // Clicks and preloads go where the href points.
    options_._fromLocation = location
    // untrack because router-core will also access stores, which are signals in solid
    const next = Solid.untrack(() => router.buildLocation(options_))
    if (!disabled) {
      // Use publicHref - it contains the correct href for display
      // When a rewrite changes the origin, publicHref is the full URL
      // Otherwise it's the origin-stripped path
      // This avoids constructing URL objects in the hot path
      const shown = next.maskedLocation ?? next
      const publicHref = shown.publicHref
      const shownHref = shown.external
        ? publicHref
        : router.history.createHref(publicHref) || '/'
      if (
        (shown.external || shownHref !== publicHref) &&
        isDangerousProtocol(shownHref, router.protocolAllowlist)
      ) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${shownHref}`)
        }
      } else {
        href = shownHref
      }
    }
    external =
      !href && !disabled ? null : href && getUrlScheme(href) ? href : undefined
    if (external === undefined) {
      const activeOptions = local.activeOptions
      const currentPath = removeTrailingSlash(
        location.pathname,
        router.basepath,
      )
      const nextPath = removeTrailingSlash(next.pathname, router.basepath)
      // Both modes compare normalized paths; fuzzy matches need a segment boundary.
      active =
        (activeOptions?.exact
          ? currentPath === nextPath
          : currentPath.startsWith(nextPath) &&
            (currentPath.length === nextPath.length ||
              currentPath[nextPath.length] === '/')) &&
        (!(activeOptions?.includeSearch ?? true) ||
          deepEqual(
            location.search,
            next.search,
            !activeOptions?.exact,
            activeOptions?.explicitUndefined,
          )) &&
        (!activeOptions?.includeHash ||
          (shouldHydrateHash && !hasHydrated() ? '' : location.hash) ===
            next.hash)
    }
  }
  href = external === null ? undefined : external || href
  return prev &&
    prev[0 /* href */] === href &&
    prev[1 /* external */] === external &&
    prev[2 /* active */] === active
    ? prev
    : [href, external, active]
}

// [element href, external href (null when blocked), active]
type LinkState = [
  href: string | undefined,
  external: string | null | undefined,
  active: boolean,
]

const isStore = (value: any): boolean => !!value?.[Solid.$PROXY]

// Props that decide where and how a Link navigates.
const NAVIGATION_KEYS = [
  'to',
  'reloadDocument',
  'replace',
  'resetScroll',
  'hashScrollIntoView',
  'startTransition',
  'viewTransition',
  'ignoreBlocker',
  'params',
  'search',
  'hash',
  'state',
  'mask',
  'unsafeRelative',
  'from',
  'href',
] as const
// Options the Link consumes; every other option is an element prop.
const LINK_OPTION_KEYS = [
  ...NAVIGATION_KEYS,
  'activeProps',
  'inactiveProps',
  'activeOptions',
  'preload',
  'preloadDelay',
  'preloadIntentProximity',
  'target',
  'disabled',
  'style',
  'class',
  'onClick',
  'onBlur',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOver',
  'onMouseOut',
  'onTouchStart',
]
const NOT_HYDRATED = () => false
const LINK_OPTION_KEY_SET: ReadonlySet<string> = new Set(LINK_OPTION_KEYS)
const LINK_COMPONENT_SKIP_KEYS: ReadonlySet<string> = new Set([
  ...LINK_OPTION_KEYS,
  '_asChild',
  'children',
  'type',
])

const STATIC_ACTIVE_PROPS = { class: 'active' }
const EMPTY_OBJECT = {}
const STATIC_DEFAULT_ACTIVE_ATTRIBUTES = {
  class: 'active',
  'data-status': 'active',
  'aria-current': 'page',
}
const STATIC_DISABLED_PROPS = {
  role: 'link' as const,
  'aria-disabled': 'true',
}
const STATIC_ACTIVE_ATTRIBUTES = {
  'data-status': 'active',
  'aria-current': 'page',
}

/** Call a JSX.EventHandlerUnion with the event. */
function callHandler<T, TEvent extends Event>(
  event: TEvent & { currentTarget: T; target: Element },
  handler: JSX.EventHandlerUnion<T, TEvent>,
) {
  if (typeof handler === 'function') {
    handler(event)
  } else {
    handler[0](handler[1], event)
  }
  return event.defaultPrevented
}

function createComposedHandler<T, TEvent extends Event>(
  getHandler: () => JSX.EventHandlerUnion<T, TEvent> | undefined,
  fallback: (event: TEvent) => void,
) {
  return (event: TEvent & { currentTarget: T; target: Element }) => {
    const handler = getHandler()
    if (!handler || !callHandler(event, handler)) fallback(event)
  }
}

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  Omit<ComponentProps<'a'>, 'style'> & { style?: JSX.CSSProperties }

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
  children?: JSX.Element | ((state: { isActive: boolean }) => JSX.Element)
}

type LinkComponentSolidProps<TComp> = TComp extends ValidComponent
  ? Omit<ComponentProps<TComp>, keyof CreateLinkProps>
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
) => JSX.Element

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
  ): JSX.Element
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => JSX.Element>,
): LinkComponent<TComp> {
  return (props) => <Link {...props} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props) => {
  let local: { _asChild?: any; children?: LinkProps['children'] }
  let linkProps: Record<string, any>
  if (isServer ?? useRouter().isServer) {
    local = props as typeof local
    linkProps = serverLinkProps(useRouter(), props, LINK_COMPONENT_SKIP_KEYS)
    if ('type' in linkProps) {
      delete linkProps.type
    }
  } else {
    let rest
    ;[local, rest] = splitProps(props as typeof props & { _asChild: any }, [
      '_asChild',
      'children',
    ])
    linkProps = splitProps(useLinkProps(rest as unknown as any), ['type'])[1]
  }

  // Resolve children once using Solid.children to avoid
  // re-accessing the children getter (which in Solid 2.0 would
  // re-invoke createComponent each time for JSX children).
  const resolvedChildren = Solid.children(() => local.children as JSX.Element)
  const children = () => {
    const ch = resolvedChildren()
    if (typeof ch === 'function') {
      return (ch as Function)({
        get isActive() {
          return (linkProps as any)['data-status'] === 'active'
        },
      })
    }

    return ch
  }

  // `createLink` sets the component once; a spread props source makes the read reactive.
  const asChild = Solid.untrack(() => local._asChild)

  if (asChild === 'svg') {
    const [_, svgLinkProps] = splitProps(linkProps as any, ['class'])
    return (
      <svg>
        <a {...svgLinkProps}>{children()}</a>
      </svg>
    )
  }

  if (!asChild) {
    return <a {...linkProps}>{children()}</a>
  }

  return (
    <Dynamic component={asChild as ValidComponent} {...linkProps}>
      {children()}
    </Dynamic>
  )
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
