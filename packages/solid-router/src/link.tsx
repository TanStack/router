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
import { Dynamic, assign } from 'solid-js/web'
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

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Solid.ComponentProps<'a'> {
  return mergeLinkParts(
    createLinkProps(options as any, LINK_OPTION_KEYS, useRouter()),
  )
}

type ResolvedLinkStateProps = Omit<Solid.ComponentProps<'a'>, 'style'> & {
  style?: Solid.JSX.CSSProperties
}

// [element props, Link props, ref, the Link's own handlers]: the server
// resolves everything into the element props.
type LinkParts = [
  elementProps: Solid.ComponentProps<'a'>,
  linkProps?: () => ResolvedLinkStateProps,
  ref?: (el: Element) => void,
  handlers?: LinkHandlers,
]

// Link props override element props they define; the ref is the Link's own.
const mergeLinkParts = ([elementProps, linkProps, ref]: LinkParts) =>
  (linkProps
    ? Solid.mergeProps(elementProps, linkProps, { ref })
    : elementProps) as Solid.ComponentProps<'a'>

// `ownKeys` are the options that never reach the element.
function createLinkProps(
  options: UseLinkPropsOptions,
  ownKeys: ReadonlyArray<string>,
  router: AnyRouter,
): LinkParts {
  // Options are read directly: one props proxy, no merged-default getters.
  const [, propsSafeToSpread] = Solid.splitProps(
    options,
    ownKeys as Array<keyof typeof options>,
  )

  // A live match never changes route, so read it once without tracking.
  const routeId = Solid.useContext(nearestMatchContext)[0 /* routeId */]()

  // While a publishing navigation leaves the Link's route, keep the location
  // the route still presents so the Link does no work. The route unmounts
  // when that navigation commits, and any other outcome publishes a newer
  // location. Compare by identity: a same-href navigation can change state.
  // The server renders one location: no reactivity there.
  const currentLocation =
    (isServer ?? router.isServer)
      ? () => router.stores.location.get()
      : Solid.createMemo((prev?: ParsedLocation) => {
          const location = router.stores.location.get()
          return prev && _isRouteDeparting(router, routeId, location)
            ? prev
            : location
        })

  // The Link's own destination options, replaced only when a destination prop
  // changes: the router reuses a location built from the same object without
  // reading the current location. A Solid store changes in place, so a store
  // prop value (checked one level deep, not nested) gets a fresh object per
  // location instead, re-reading the store at each navigation as before. A
  // mask holds destination options of its own, so its values are checked too.
  const getDest = () => {
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
  }
  const dest =
    (isServer ?? router.isServer) ? getDest : Solid.createMemo(getDest)

  // Only a hydrating client renders the server's hash-less active state first.
  const hasHydrated =
    !(isServer ?? router.isServer) && router.options.ssr
      ? useHydrated()
      : undefined

  // Everything the Link derives from its destination and the location, in
  // one computation: [element href, external href (null when blocked),
  // active]. An unchanged result keeps its identity, so a navigation that
  // leaves the Link as it was notifies nothing downstream.
  const getLinkState = (prev?: LinkState): LinkState => {
    const location = currentLocation()
    const to = options.to
    const disabled = options.disabled
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
        !href && !disabled
          ? null
          : href && getUrlScheme(href)
            ? href
            : undefined
      if (external === undefined) {
        const activeOptions = options.activeOptions
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
            (hasHydrated && !hasHydrated() ? '' : location.hash) === next.hash)
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
  const linkState =
    (isServer ?? router.isServer)
      ? getLinkState
      : Solid.createMemo(getLinkState)

  const resolveLinkStateProps = (
    [href, external, active]: LinkState,
    base: Solid.ComponentProps<'a'> & { disabled?: boolean },
  ) => {
    const disabled = options.disabled || external === null
    base.href = href
    base.disabled = disabled
    base.target = options.target
    if (disabled) {
      Object.assign(base, STATIC_DISABLED_PROPS)
    }

    if (
      options.activeProps === undefined &&
      options.inactiveProps === undefined &&
      options.class === undefined &&
      options.style === undefined
    ) {
      return active
        ? Object.assign(base, STATIC_DEFAULT_ACTIVE_ATTRIBUTES)
        : base
    }

    const stateProps: ResolvedLinkStateProps =
      functionalUpdate(
        (active ? options.activeProps : options.inactiveProps) ??
          (active ? STATIC_ACTIVE_PROPS : EMPTY_OBJECT),
        {},
      ) ?? EMPTY_OBJECT
    const baseStyle = options.style
    const stateStyle = stateProps.style
    // Snapshot reactive style properties so in-place updates remain observable.
    const style =
      baseStyle || stateStyle ? { ...baseStyle, ...stateStyle } : undefined
    const baseClass = options.class
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
      href,
      disabled,
      target: base.target,
      ...(style && hasKeys(style) && { style }),
      ...(className && { class: className }),
      ...(active && STATIC_ACTIVE_ATTRIBUTES),
    } as ResolvedLinkStateProps
  }

  // Keep the guard inline so browser builds can drop the server return.
  if (isServer ?? router.isServer) {
    const props = resolveLinkStateProps(linkState(), {
      onClick: options.onClick,
      onBlur: options.onBlur,
      onFocus: options.onFocus,
      onMouseEnter: options.onMouseEnter,
      onMouseLeave: options.onMouseLeave,
      onMouseOut: options.onMouseOut,
      onMouseOver: options.onMouseOver,
      onTouchStart: options.onTouchStart,
      ref: options.ref,
    })
    // Avoid creating merged-prop getters for absent server event handlers.
    for (const key of STATIC_EVENT_PROPS) {
      if (props[key] === undefined) {
        delete props[key]
      }
    }
    return [Solid.mergeProps(propsSafeToSpread, props) as any]
  }

  let hasRenderFetched = false

  const preload = () =>
    !options.reloadDocument &&
    linkState()[1 /* external */] === undefined &&
    !options.disabled &&
    (options.preload ?? router.options.defaultPreload)
  const preloadDelay = () =>
    options.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = () =>
    router.preloadRoute(dest()).catch((err: any) => {
      console.warn(err)
      console.warn(preloadWarning)
    })

  const [ref, setRef] = Solid.createSignal<Element | null>(null)

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

  Solid.createEffect(() => {
    if (hasRenderFetched) {
      return
    }
    if (preload() === 'render') {
      doPreload()
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
      options.target !== undefined ? options.target : elementTarget

    if (
      !options.disabled &&
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
      router.navigate(dest())
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

  // The user's handler runs first and can prevent the Link's own. A handler
  // from the selected state props replaces both, also where the Link binds
  // its handlers to the element directly.
  const composeHandler = (
    key: (typeof STATIC_EVENT_PROPS)[number],
    fallback: (event: any) => void,
  ) => {
    const handler = (event: any) => {
      const current = resolvedProps()[key] as any
      if (current !== handler) {
        if (current) {
          callHandler(event, current)
        }
        return
      }
      const own = options[key] as any
      if (!own || !callHandler(event, own)) {
        fallback(event)
      }
    }
    return handler
  }

  const handlers: LinkHandlers = {
    onClick: composeHandler('onClick', handleClick),
    onBlur: composeHandler('onBlur', handleLeave),
    onFocus: composeHandler('onFocus', enqueuePreload),
    onMouseEnter: composeHandler('onMouseEnter', enqueuePreload),
    onMouseOver: composeHandler('onMouseOver', enqueuePreload),
    onMouseLeave: composeHandler('onMouseLeave', handleLeave),
    onMouseOut: composeHandler('onMouseOut', handleLeave),
    onTouchStart: composeHandler('onTouchStart', handleTouchStart),
  }

  // One ref callback per element. The selected state props' ref, else the
  // Link's own, receives the element once; a state change does not re-call it.
  const linkRef = (el: Element) => {
    setRef(el)
    const ref = Solid.untrack(resolvedProps).ref ?? options.ref
    if (typeof ref === 'function') {
      ref(el as HTMLAnchorElement)
    }
  }

  const resolvedProps = Solid.createMemo(() =>
    resolveLinkStateProps(linkState(), { ...handlers }),
  )

  return [propsSafeToSpread, resolvedProps as any, linkRef, handlers]
}

type LinkHandlers = Record<
  (typeof STATIC_EVENT_PROPS)[number],
  (event: any) => void
>

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
// A Link also consumes its children and component, and drops `type`.
const LINK_ELEMENT_KEYS = [...LINK_OPTION_KEYS, '_asChild', 'children', 'type']
const STATIC_EVENT_PROPS = [
  'onClick',
  'onBlur',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOut',
  'onMouseOver',
  'onTouchStart',
] as const
// Attributes a client anchor binds itself: an element prop of the same name
// applies where the Link leaves one unset, as when merged.
const LINK_ATTRIBUTE_KEYS = [
  'ref',
  'role',
  'aria-disabled',
  'data-status',
  'aria-current',
]
const LINK_ANCHOR_KEYS = [...LINK_ELEMENT_KEYS, ...LINK_ATTRIBUTE_KEYS]
// Every Link prop a client anchor binds itself.
const LINK_BOUND_KEYS = new Set<string>([
  ...STATIC_EVENT_PROPS,
  ...LINK_ATTRIBUTE_KEYS,
  'href',
  'disabled',
  'target',
  'class',
  'style',
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
  'aria-disabled': true,
}
const STATIC_ACTIVE_ATTRIBUTES = {
  'data-status': 'active',
  'aria-current': 'page',
}

/** Call a JSX.EventHandlerUnion with the event. */
function callHandler<T, TEvent extends Event>(
  event: TEvent & { currentTarget: T; target: Element },
  handler: Solid.JSX.EventHandlerUnion<T, TEvent>,
) {
  if (typeof handler === 'function') {
    handler(event)
  } else {
    handler[0](handler[1], event)
  }
  return event.defaultPrevented
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
    | ((state: { isActive: boolean }) => Solid.JSX.Element)
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
  ): Solid.JSX.Element
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Solid.JSX.Element>,
): LinkComponent<TComp> {
  return (props) => <Link {...props} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props) => {
  const local = props as typeof props & { _asChild: any }
  const router = useRouter()
  let status: () => unknown

  // Element insertion tracks this itself; only a custom component, which may
  // read its children more than once, gets a memo.
  const children = () => {
    const ch = local.children
    if (typeof ch === 'function') {
      return ch({
        get isActive() {
          return status() === 'active'
        },
      })
    }

    return ch satisfies Solid.JSX.Element
  }

  // A client anchor binds the Link's own attributes and handlers directly
  // instead of spreading them: only the other element props, and other keys
  // of the selected state props, are assigned as a spread assigns them.
  if (!(isServer ?? router.isServer) && !local._asChild) {
    const [elementProps, linkProps, linkRef, handlers] = createLinkProps(
      props as any,
      LINK_ANCHOR_KEYS,
      router,
    ) as Required<LinkParts>
    const attribute = (key: string) => {
      const value = (linkProps() as any)[key]
      return value !== undefined ? value : (props as any)[key]
    }
    status = () => attribute('data-status')
    const hasStateProps = 'activeProps' in props || 'inactiveProps' in props
    const ref = (el: Element) => {
      linkRef(el)
      // The other props apply before the Link's own, as in a merged spread.
      if (
        hasStateProps ||
        Solid.$PROXY in elementProps ||
        hasKeys(elementProps as Record<string, unknown>)
      ) {
        const prev = {}
        Solid.createRenderEffect(() => {
          const otherProps: Record<string, unknown> = { ...elementProps }
          const state: Record<string, unknown> = hasStateProps
            ? linkProps()
            : EMPTY_OBJECT
          for (const key in state) {
            if (
              !LINK_BOUND_KEYS.has(key) &&
              (state[key] !== undefined || !(key in otherProps))
            ) {
              otherProps[key] = state[key]
            }
          }
          assign(el, otherProps, false, true, prev, true)
        })
      }
    }
    return (
      <a
        ref={ref}
        href={linkProps().href}
        // @ts-expect-error A disabled Link sets the element's `disabled` property, as a spread does.
        disabled={linkProps().disabled}
        target={linkProps().target}
        role={attribute('role')}
        aria-disabled={attribute('aria-disabled')}
        style={linkProps().style}
        class={linkProps().class}
        data-status={status()}
        aria-current={attribute('aria-current')}
        onClick={handlers.onClick}
        onBlur={handlers.onBlur}
        onFocus={handlers.onFocus}
        onMouseEnter={handlers.onMouseEnter}
        onMouseOver={handlers.onMouseOver}
        onMouseLeave={handlers.onMouseLeave}
        onMouseOut={handlers.onMouseOut}
        onTouchStart={handlers.onTouchStart}
      >
        {children()}
      </a>
    )
  }

  // One props proxy between the element and the Link's props.
  const linkProps = mergeLinkParts(
    createLinkProps(props as any, LINK_ELEMENT_KEYS, router),
  )
  status = () => (linkProps as any)['data-status']

  if (local._asChild === 'svg') {
    const [_, svgLinkProps] = Solid.splitProps(linkProps, ['class'])
    return (
      <svg>
        <a {...svgLinkProps}>{children()}</a>
      </svg>
    )
  }

  // A client anchor returned above.
  if ((isServer ?? router.isServer) && !local._asChild) {
    return <a {...linkProps}>{children()}</a>
  }

  const memo = Solid.createMemo(children)
  return (
    <Dynamic component={local._asChild as Solid.ValidComponent} {...linkProps}>
      {memo()}
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
