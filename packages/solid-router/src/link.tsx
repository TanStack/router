import * as Solid from 'solid-js'

import { mergeRefs } from '@solid-primitives/refs'

import {
  deepEqual,
  functionalUpdate,
  getUrlScheme,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from 'solid-js/web'
import { useRouterContext } from './useRouter'

import { useIntersectionObserver } from './utils'

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
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

const timeoutMap = new WeakMap<object, ReturnType<typeof setTimeout>>()
const cancelPreload = (eventTarget: object) => {
  clearTimeout(timeoutMap.get(eventTarget))
  timeoutMap.delete(eventTarget)
}

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): Solid.ComponentProps<'a'> {
  const [router, source] = useRouterContext()
  const [local, rest] = Solid.splitProps(
    Solid.mergeProps(
      {
        activeProps: STATIC_ACTIVE_PROPS_GET,
        inactiveProps: STATIC_INACTIVE_PROPS_GET,
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
    'unsafeRelative',
    'from',
    'href',
  ])

  // Server rendering uses direct snapshots before any native reactive setup.
  if (isServer ?? router.isServer) {
    return getServerLinkProps(router, options, local, propsSafeToSpread)
  }

  const currentLocation = () => source!.get()
  const next = Solid.createMemo(() => {
    const _fromLocation = currentLocation()
    const nextOptions = { ...options, _fromLocation } as any
    // Core store reads and user updaters are not incidental Solid dependencies.
    return Solid.untrack(() => router.buildLocation(nextOptions))
  })

  const hrefOption = Solid.createMemo(() =>
    getHrefOption(next(), router, local.disabled),
  )
  const externalLink = Solid.createMemo(() =>
    resolveExternalLink(
      local.to as string | undefined,
      hrefOption(),
      local.disabled,
      router,
    ),
  )
  const shouldHydrateHash = !isServer && !!router.options.ssr
  const hasHydrated = useHydrated()
  const isActive = Solid.createMemo(() => {
    if (externalLink() !== undefined) {
      return false
    }
    const activeOptions = local.activeOptions
    return resolveIsActive(
      currentLocation(),
      next(),
      activeOptions,
      router.basepath,
      !activeOptions?.includeHash || !shouldHydrateHash || hasHydrated(),
    )
  })

  const simpleStyling = Solid.createMemo(
    () =>
      local.activeProps === STATIC_ACTIVE_PROPS_GET &&
      local.inactiveProps === STATIC_INACTIVE_PROPS_GET &&
      local.class === undefined &&
      local.style === undefined,
  )

  let hasRenderFetched = false

  const preload = Solid.createMemo(() => {
    if (
      options.reloadDocument ||
      externalLink() !== undefined ||
      local.disabled
    ) {
      return false
    }
    return local.preload ?? router.options.defaultPreload
  })
  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = () =>
    router
      .preloadRoute({
        ...options,
        _fromLocation: currentLocation(),
      } as Parameters<typeof router.preloadRoute>[0])
      .catch((err: any) => {
        console.warn(err)
        console.warn(preloadWarning)
      })

  const [ref, setRef] = Solid.createSignal<Element | null>(null)

  const enqueuePreload = (
    e?: MouseEvent | FocusEvent | IntersectionObserverEntry,
  ) => {
    if (!e) {
      cancelPreload(ref)
      return
    }

    if (
      !(
        (e as IntersectionObserverEntry).isIntersecting ??
        preload() === 'intent'
      )
    ) {
      if ((e as IntersectionObserverEntry).isIntersecting === false) {
        cancelPreload(ref)
      }
      return
    }

    if (!preloadDelay()) {
      doPreload()
      return
    }

    if (!timeoutMap.has(ref)) {
      timeoutMap.set(
        ref,
        setTimeout(() => {
          timeoutMap.delete(ref)
          doPreload()
        }, preloadDelay()),
      )
    }
  }

  useIntersectionObserver(
    ref,
    enqueuePreload,
    () => preload() !== 'viewport',
    // Intent preloading still needs timer cleanup without an observer.
    () => !!preload(),
  )

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
      local.target !== undefined ? local.target : elementTarget

    if (
      !local.disabled &&
      externalLink() === undefined &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()
      cancelPreload(ref)

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate({
        ...options,
        _fromLocation: currentLocation(),
        replace: local.replace,
        resetScroll: local.resetScroll,
        hashScrollIntoView: local.hashScrollIntoView,
        startTransition: local.startTransition,
        viewTransition: local.viewTransition,
        ignoreBlocker: local.ignoreBlocker,
      })
    }
  }

  const handleTouchStart = () => {
    if (preload() !== 'intent') {
      return
    }
    doPreload()
  }

  const handleLeave = () => {
    if (preload() === 'intent') {
      cancelPreload(ref)
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

  const resolvedProps = Solid.createMemo(() => {
    const external = externalLink()
    const disabled = local.disabled || external === null

    const base = {
      href: external === null ? undefined : external || hrefOption(),
      ref: mergeRefs(setRef, options.ref),
      onClick,
      onBlur,
      onFocus,
      onMouseEnter,
      onMouseOver,
      onMouseLeave,
      onMouseOut,
      onTouchStart,
      disabled,
      target: local.target,
      ...(disabled && STATIC_DISABLED_PROPS),
    }

    return resolveLinkStateProps(base, local, isActive(), simpleStyling())
  })

  return Solid.mergeProps(propsSafeToSpread, resolvedProps) as any
}

type RuntimeLinkOptions = Omit<Solid.ComponentProps<'a'>, 'style'> &
  ActiveLinkOptionProps<'a'> & {
    style?: Solid.JSX.CSSProperties
    to?: string
    disabled?: boolean
    activeOptions?: ActiveOptions
  }

type ResolvedLinkStateProps = Omit<Solid.ComponentProps<'a'>, 'style'> & {
  style?: Solid.JSX.CSSProperties
}

function resolveLinkStateProps(
  base: Solid.ComponentProps<'a'> & { disabled?: boolean },
  options: Pick<
    RuntimeLinkOptions,
    'activeProps' | 'inactiveProps' | 'class' | 'style'
  >,
  active: boolean,
  simpleStyling = options.activeProps === STATIC_ACTIVE_PROPS_GET &&
    options.inactiveProps === STATIC_INACTIVE_PROPS_GET &&
    options.class === undefined &&
    options.style === undefined,
) {
  if (simpleStyling) {
    return { ...base, ...(active && STATIC_DEFAULT_ACTIVE_ATTRIBUTES) }
  }
  const stateProps: ResolvedLinkStateProps =
    functionalUpdate(
      active ? options.activeProps : options.inactiveProps,
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
    href: base.href,
    disabled: base.disabled,
    target: base.target,
    ...(style && hasKeys(style) && { style }),
    ...(className && { class: className }),
    ...(active && STATIC_ACTIVE_ATTRIBUTES),
  } as ResolvedLinkStateProps
}

function getHrefOption(
  location: ParsedLocation,
  router: AnyRouter,
  disabled?: boolean,
) {
  if (disabled) {
    return undefined
  }
  const next = location.maskedLocation ?? location
  const publicHref = next.publicHref
  const href = next.external
    ? publicHref
    : router.history.createHref(publicHref) || '/'
  if (
    (next.external || href !== publicHref) &&
    isDangerousProtocol(href, router.protocolAllowlist)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`Blocked Link with dangerous protocol: ${href}`)
    }
    return undefined
  }
  return href
}

function resolveExternalLink(
  to: string | undefined,
  href: string | undefined,
  disabled: boolean | undefined,
  router: AnyRouter,
) {
  const scheme = typeof to === 'string' && getUrlScheme(to)
  if (scheme) {
    if (!router.protocolAllowlist.has(scheme)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Blocked Link with dangerous protocol: ${to}`)
      }
      return null
    }
    return to
  }
  if (!href && !disabled) {
    return null
  }
  return href && getUrlScheme(href) ? href : undefined
}

function resolveIsActive(
  current: ParsedLocation,
  next: ParsedLocation,
  activeOptions: ActiveOptions | undefined,
  basepath: string,
  hashHydrated: boolean,
) {
  const currentPath = removeTrailingSlash(current.pathname, basepath)
  const nextPath = removeTrailingSlash(next.pathname, basepath)
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
  if (
    (activeOptions?.includeSearch ?? true) &&
    !deepEqual(
      current.search,
      next.search,
      !activeOptions?.exact,
      activeOptions?.explicitUndefined,
    )
  ) {
    return false
  }
  if (activeOptions?.includeHash) {
    return (hashHydrated ? current.hash : '') === next.hash
  }
  return true
}

function getServerLinkProps(
  router: AnyRouter,
  options: RuntimeLinkOptions,
  local: Pick<
    RuntimeLinkOptions,
    | 'to'
    | 'disabled'
    | 'activeOptions'
    | 'target'
    | 'activeProps'
    | 'inactiveProps'
    | 'class'
    | 'style'
    | (typeof STATIC_EVENT_PROPS)[number]
  >,
  propsSafeToSpread: Solid.ComponentProps<'a'>,
) {
  const current = router.stores.location.get()
  const next = router.buildLocation({
    ...options,
    _fromLocation: current,
  } as any)
  const href = getHrefOption(next, router, local.disabled)
  const external = resolveExternalLink(local.to, href, local.disabled, router)
  const disabled = local.disabled || external === null
  const active =
    external === undefined &&
    resolveIsActive(
      current,
      next,
      local.activeOptions,
      router.basepath,
      !(!isServer && !!router.options.ssr),
    )
  const props = resolveLinkStateProps(
    {
      onClick: local.onClick,
      onBlur: local.onBlur,
      onFocus: local.onFocus,
      onMouseEnter: local.onMouseEnter,
      onMouseLeave: local.onMouseLeave,
      onMouseOut: local.onMouseOut,
      onMouseOver: local.onMouseOver,
      onTouchStart: local.onTouchStart,
      href: external === null ? undefined : external || href,
      ref: options.ref,
      disabled,
      target: local.target,
      ...(disabled && STATIC_DISABLED_PROPS),
    },
    local,
    active,
  )
  // Preserve the existing absent-handler server prop shape.
  for (const key of STATIC_EVENT_PROPS) {
    if (props[key] === undefined) {
      delete props[key]
    }
  }
  return Solid.mergeProps(propsSafeToSpread, props) as any
}

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
const STATIC_ACTIVE_PROPS = { class: 'active' }
const STATIC_ACTIVE_PROPS_GET = () => STATIC_ACTIVE_PROPS
const EMPTY_OBJECT = {}
const STATIC_INACTIVE_PROPS_GET = () => EMPTY_OBJECT
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

function createComposedHandler<T, TEvent extends Event>(
  getHandler: () => Solid.JSX.EventHandlerUnion<T, TEvent> | undefined,
  fallback: (event: TEvent) => void,
) {
  return (event: TEvent & { currentTarget: T; target: Element }) => {
    const handler = getHandler()
    if (!handler || !callHandler(event, handler)) {
      fallback(event)
    }
  }
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
  const [local, rest] = Solid.splitProps(
    props as typeof props & { _asChild: any },
    ['_asChild', 'children'],
  )

  const [_, linkProps] = Solid.splitProps(
    useLinkProps(rest as unknown as any),
    ['type'],
  )

  const children = Solid.createMemo(() => {
    const ch = local.children
    if (typeof ch === 'function') {
      return ch({
        get isActive() {
          return (linkProps as any)['data-status'] === 'active'
        },
      })
    }

    return ch satisfies Solid.JSX.Element
  })

  if (local._asChild === 'svg') {
    const [_, svgLinkProps] = Solid.splitProps(linkProps, ['class'])
    return (
      <svg>
        <a {...svgLinkProps}>{children()}</a>
      </svg>
    )
  }

  if (!local._asChild) {
    return <a {...linkProps}>{children()}</a>
  }

  return (
    <Dynamic component={local._asChild as Solid.ValidComponent} {...linkProps}>
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
