import * as Solid from 'solid-js'

import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from '@solidjs/web'
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
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'
import type { ComponentProps, JSX, ValidComponent } from '@solidjs/web'

function mergeRefs<T>(
  ...refs: Array<((el: T) => void) | undefined>
): (el: T) => void {
  return (el: T) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(el)
      }
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
const timeoutMap = new WeakMap<EventTarget, ReturnType<typeof setTimeout>>()

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
  const [isTransitioning, setIsTransitioning] = Solid.createSignal(false)
  const shouldHydrateHash = !isServer && !!router.options.ssr
  const hasHydrated = useHydrated()

  if (isServer) {
    return getServerLinkProps(router, options as any)
  }

  let hasRenderFetched = false

  const [local, rest] = splitProps(
    Solid.merge(
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

  const [_, propsSafeToSpread] = splitProps(rest, [
    'params',
    'search',
    'hash',
    'state',
    'mask',
    'reloadDocument',
    'unsafeRelative',
  ] as any)

  const currentLocation = Solid.createMemo(() => router.stores.location.state, {
    equals: (prev, next) => prev?.href === next?.href,
  })

  const _options = () => options

  const next = Solid.createMemo(() => {
    // Rebuild when inherited search/hash or the current route context changes.
    const _fromLocation = currentLocation()
    const options = { _fromLocation, ..._options() } as any
    // untrack because router-core will also access stores, which are signals in solid
    return Solid.untrack(() => router.buildLocation(options))
  })

  const hrefOption = Solid.createMemo(() => {
    if (_options().disabled) return undefined
    // Use publicHref - it contains the correct href for display
    // When a rewrite changes the origin, publicHref is the full URL
    // Otherwise it's the origin-stripped path
    // This avoids constructing URL objects in the hot path
    const location = next().maskedLocation ?? next()
    const publicHref = location.publicHref
    const external = location.external

    if (external) {
      return { href: publicHref, external: true }
    }

    return {
      href: router.history.createHref(publicHref) || '/',
      external: false,
    }
  })

  const externalLink = Solid.createMemo(() => {
    const _href = hrefOption()
    if (_href?.external) {
      // Block dangerous protocols for external links
      if (isDangerousProtocol(_href.href, router.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${_href.href}`)
        }
        return undefined
      }
      return _href.href
    }
    const to = _options().to
    const safeInternal = isSafeInternal(to)
    if (safeInternal) return undefined
    if (typeof to !== 'string' || to.indexOf(':') === -1) return undefined
    try {
      new URL(to as any)
      // Block dangerous protocols like javascript:, blob:, data:
      if (isDangerousProtocol(to, router.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${to}`)
        }
        return undefined
      }
      return to
    } catch {}
    return undefined
  })

  const preload = Solid.createMemo(() => {
    if (_options().reloadDocument || externalLink()) {
      return false
    }
    return local.preload ?? router.options.defaultPreload
  })
  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = Solid.createMemo(() => {
    if (externalLink()) return false
    const activeOptions = local.activeOptions
    const current = currentLocation()
    const nextLocation = next()

    if (activeOptions?.exact) {
      const testExact = exactPathTest(
        current.pathname,
        nextLocation.pathname,
        router.basepath,
      )
      if (!testExact) {
        return false
      }
    } else {
      const currentPath = removeTrailingSlash(current.pathname, router.basepath)
      const nextPath = removeTrailingSlash(
        nextLocation.pathname,
        router.basepath,
      )

      const pathIsFuzzyEqual =
        currentPath.startsWith(nextPath) &&
        (currentPath.length === nextPath.length ||
          currentPath[nextPath.length] === '/')
      if (!pathIsFuzzyEqual) {
        return false
      }
    }

    if (activeOptions?.includeSearch ?? true) {
      const searchTest = deepEqual(current.search, nextLocation.search, {
        partial: !activeOptions?.exact,
        ignoreUndefined: !activeOptions?.explicitUndefined,
      })
      if (!searchTest) {
        return false
      }
    }

    if (activeOptions?.includeHash) {
      const currentHash =
        shouldHydrateHash && !hasHydrated() ? '' : current.hash
      return currentHash === nextLocation.hash
    }
    return true
  })

  const doPreload = () =>
    router
      .preloadRoute({ ..._options(), _builtLocation: next() } as any)
      .catch((err: any) => {
        console.warn(err)
        console.warn(preloadWarning)
      })

  const preloadViewportIoCallback = (
    entry: IntersectionObserverEntry | undefined,
  ) => {
    if (entry?.isIntersecting) {
      doPreload()
    }
  }

  const [ref, setRefSignal] = Solid.createSignal<Element | null>(null)

  const setRef = (el: Element | null) => {
    Solid.runWithOwner(null, () => {
      setRefSignal(el)
    })
  }

  useIntersectionObserver(
    ref,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    { disabled: !!local.disabled || !(Solid.untrack(preload) === 'viewport') },
  )

  Solid.createEffect(preload, (preloadValue) => {
    if (hasRenderFetched) {
      return
    }
    if (!local.disabled && preloadValue === 'render') {
      Solid.untrack(() => doPreload())
      hasRenderFetched = true
    }
  })

  if (Solid.untrack(externalLink)) {
    const externalHref = Solid.untrack(externalLink)
    return Solid.merge(
      propsSafeToSpread,
      {
        // ref: mergeRefs(setRef, _options().ref),
        href: externalHref,
      },
      splitProps(local, [
        'target',
        'disabled',
        'style',
        'class',
        'onClick',
        'onBlur',
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
    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    ).getAttribute('target')
    const effectiveTarget =
      local.target !== undefined ? local.target : elementTarget

    if (
      !local.disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()

      Solid.runWithOwner(null, () => {
        setIsTransitioning(true)
      })

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        Solid.runWithOwner(null, () => {
          setIsTransitioning(false)
        })
      })

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate({
        ..._options(),
        replace: local.replace,
        resetScroll: local.resetScroll,
        hashScrollIntoView: local.hashScrollIntoView,
        startTransition: local.startTransition,
        viewTransition: local.viewTransition,
        ignoreBlocker: local.ignoreBlocker,
      })
    }
  }

  const enqueueIntentPreload = (e: MouseEvent | FocusEvent) => {
    if (local.disabled || preload() !== 'intent') return

    if (!preloadDelay()) {
      doPreload()
      return
    }

    const eventTarget = e.currentTarget || e.target

    if (!eventTarget || timeoutMap.has(eventTarget)) return

    timeoutMap.set(
      eventTarget,
      setTimeout(() => {
        timeoutMap.delete(eventTarget)
        doPreload()
      }, preloadDelay()),
    )
  }

  const handleTouchStart = (_: TouchEvent) => {
    if (local.disabled || preload() !== 'intent') return
    doPreload()
  }

  const handleLeave = (e: MouseEvent | FocusEvent) => {
    if (local.disabled) return
    const eventTarget = e.currentTarget || e.target

    if (eventTarget) {
      const id = timeoutMap.get(eventTarget)
      clearTimeout(id)
      timeoutMap.delete(eventTarget)
    }
  }

  const simpleStyling = Solid.createMemo(
    () =>
      local.activeProps === STATIC_ACTIVE_PROPS_GET &&
      local.inactiveProps === STATIC_INACTIVE_PROPS_GET &&
      local.class === undefined &&
      local.style === undefined,
  )

  const onClick = createComposedHandler(() => local.onClick, handleClick)
  const onBlur = createComposedHandler(() => local.onBlur, handleLeave)
  const onFocus = createComposedHandler(
    () => local.onFocus,
    enqueueIntentPreload,
  )
  const onMouseEnter = createComposedHandler(
    () => local.onMouseEnter,
    enqueueIntentPreload,
  )
  const onMouseOver = createComposedHandler(
    () => local.onMouseOver,
    enqueueIntentPreload,
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

  const resolvedProps = Solid.createMemo(() => {
    const active = isActive()

    const base = {
      href: hrefOption()?.href,
      ref: mergeRefs(setRef, _options().ref as any),
      onClick,
      onBlur,
      onFocus,
      onMouseEnter,
      onMouseOver,
      onMouseLeave,
      onMouseOut,
      onTouchStart,
      disabled: !!local.disabled,
      target: local.target,
      ...(local.disabled && STATIC_DISABLED_PROPS),
      ...(isTransitioning() && STATIC_TRANSITIONING_ATTRIBUTES),
    }

    if (simpleStyling()) {
      return {
        ...base,
        ...(active && STATIC_DEFAULT_ACTIVE_ATTRIBUTES),
      }
    }

    const activeProps: ResolvedLinkStateProps = active
      ? (functionalUpdate(local.activeProps as any, {}) ?? EMPTY_OBJECT)
      : EMPTY_OBJECT
    const inactiveProps: ResolvedLinkStateProps = active
      ? EMPTY_OBJECT
      : functionalUpdate(local.inactiveProps, {})
    const style = {
      ...local.style,
      ...activeProps.style,
      ...inactiveProps.style,
    }
    const className = [local.class, activeProps.class, inactiveProps.class]
      .filter(Boolean)
      .join(' ')

    return {
      ...activeProps,
      ...inactiveProps,
      ...base,
      ...(Object.keys(style).length ? { style } : undefined),
      ...(className ? { class: className } : undefined),
      ...(active && STATIC_ACTIVE_ATTRIBUTES),
    } as ResolvedLinkStateProps
  })

  return Solid.merge(propsSafeToSpread, resolvedProps) as any
}

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
  role: 'link',
  'aria-disabled': 'true',
}
const STATIC_ACTIVE_ATTRIBUTES = {
  'data-status': 'active',
  'aria-current': 'page',
}
const STATIC_TRANSITIONING_ATTRIBUTES = {
  'data-transitioning': 'transitioning',
}

const SERVER_LINK_OMIT_KEYS = new Set([
  'activeOptions',
  'activeProps',
  'disabled',
  'hash',
  'hashScrollIntoView',
  'ignoreBlocker',
  'inactiveProps',
  'mask',
  'onBlur',
  'onClick',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOut',
  'onMouseOver',
  'onTouchStart',
  'params',
  'preload',
  'preloadDelay',
  'ref',
  'reloadDocument',
  'replace',
  'resetScroll',
  'search',
  'startTransition',
  'state',
  'style',
  'target',
  'to',
  'unsafeRelative',
  'viewTransition',
  'class',
])

function getServerLinkProps(
  router: AnyRouter,
  options: Record<string, any>,
): ComponentProps<'a'> {
  const current = router.stores.location.state
  const next = Solid.untrack(() =>
    router.buildLocation({ _fromLocation: current, ...options } as any),
  )
  const hrefLocation = next.maskedLocation ?? next
  const out: Record<string, any> = {}

  for (const key in options) {
    if (!SERVER_LINK_OMIT_KEYS.has(key)) out[key] = options[key]
  }

  if (hrefLocation.external) {
    if (!isDangerousProtocol(hrefLocation.publicHref, router.protocolAllowlist)) {
      out.href = hrefLocation.publicHref
    }
    addServerLinkBaseProps(out, options, false)
    return out
  }

  if (
    typeof options.to === 'string' &&
    options.to.indexOf(':') !== -1 &&
    !isSafeInternal(options.to)
  ) {
    try {
      new URL(options.to)
      if (!isDangerousProtocol(options.to, router.protocolAllowlist)) {
        out.href = options.to
      }
      addServerLinkBaseProps(out, options, false)
      return out
    } catch {}
  }

  const disabled = !!options.disabled
  out.href = disabled
    ? undefined
    : router.history.createHref(hrefLocation.publicHref) || '/'
  addServerLinkBaseProps(out, options, disabled)

  const activeOptions = options.activeOptions
  let isActive: boolean
  if (activeOptions?.exact) {
    isActive = exactPathTest(current.pathname, next.pathname, router.basepath)
  } else {
    const currentPath = removeTrailingSlash(current.pathname, router.basepath)
    const nextPath = removeTrailingSlash(next.pathname, router.basepath)
    isActive =
      currentPath.startsWith(nextPath) &&
      (currentPath.length === nextPath.length || currentPath[nextPath.length] === '/')
  }

  if (isActive && (activeOptions?.includeSearch ?? true)) {
    isActive = deepEqual(current.search, next.search, {
      partial: !activeOptions?.exact,
      ignoreUndefined: !activeOptions?.explicitUndefined,
    })
  }
  if (isActive && activeOptions?.includeHash) {
    isActive = current.hash === next.hash
  }

  const activePropsFn = options.activeProps ?? STATIC_ACTIVE_PROPS_GET
  const inactivePropsFn = options.inactiveProps ?? STATIC_INACTIVE_PROPS_GET
  if (
    activePropsFn === STATIC_ACTIVE_PROPS_GET &&
    inactivePropsFn === STATIC_INACTIVE_PROPS_GET &&
    options.class === undefined &&
    options.style === undefined
  ) {
    if (isActive) Object.assign(out, STATIC_DEFAULT_ACTIVE_ATTRIBUTES)
    return out
  }

  const activeProps = isActive
    ? (functionalUpdate(activePropsFn, {}) ?? EMPTY_OBJECT)
    : EMPTY_OBJECT
  const inactiveProps = isActive
    ? EMPTY_OBJECT
    : functionalUpdate(inactivePropsFn, {})
  const style = {
    ...options.style,
    ...activeProps.style,
    ...inactiveProps.style,
  }
  const className = [options.class, activeProps.class, inactiveProps.class]
    .filter(Boolean)
    .join(' ')

  return {
    ...activeProps,
    ...inactiveProps,
    ...out,
    ...(Object.keys(style).length ? { style } : undefined),
    ...(className ? { class: className } : undefined),
    ...(isActive && STATIC_ACTIVE_ATTRIBUTES),
  }
}

function addServerLinkBaseProps(
  out: Record<string, any>,
  options: Record<string, any>,
  disabled: boolean,
) {
  out.disabled = disabled
  if (options.target !== undefined) out.target = options.target
  if (options.style !== undefined) out.style = options.style
  if (options.class !== undefined) out.class = options.class
  if (disabled) Object.assign(out, STATIC_DISABLED_PROPS)
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
  children?:
    | JSX.Element
    | ((state: { isActive: boolean; isTransitioning: boolean }) => JSX.Element)
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
  const [local, rest] = splitProps(props as typeof props & { _asChild: any }, [
    '_asChild',
    'children',
  ])
  const useFastAnchor = canUseFastAnchor(props as any)

  const [_, linkProps] = splitProps(useLinkProps(rest as unknown as any), [
    'type',
  ])

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
        get isTransitioning() {
          return (linkProps as any)['data-transitioning'] === 'transitioning'
        },
      })
    }

    return ch
  }

  if (local._asChild === 'svg') {
    const [_, svgLinkProps] = splitProps(linkProps as any, ['class'])
    return (
      <svg>
        <a {...svgLinkProps}>{children()}</a>
      </svg>
    )
  }

  if (!local._asChild) {
    if (useFastAnchor) {
      const anchorProps = linkProps as any

      return (
        <a
          href={linkProps.href}
          ref={linkProps.ref as any}
          onClick={linkProps.onClick}
          onBlur={linkProps.onBlur}
          onFocus={linkProps.onFocus}
          onMouseEnter={linkProps.onMouseEnter}
          onMouseOver={linkProps.onMouseOver}
          onMouseLeave={linkProps.onMouseLeave}
          onMouseOut={linkProps.onMouseOut}
          onTouchStart={linkProps.onTouchStart}
          target={linkProps.target}
          role={linkProps.role}
          aria-disabled={linkProps['aria-disabled']}
          aria-current={linkProps['aria-current']}
          data-status={anchorProps['data-status']}
          data-transitioning={anchorProps['data-transitioning']}
          data-testid={anchorProps['data-testid']}
          style={linkProps.style}
          class={linkProps.class}
        >
          {children()}
        </a>
      )
    }

    return <a {...linkProps}>{children()}</a>
  }

  return (
    <Dynamic component={local._asChild as ValidComponent} {...linkProps}>
      {children()}
    </Dynamic>
  )
}

const FAST_ANCHOR_PROP_KEYS = new Set([
  'activeOptions',
  'activeProps',
  'children',
  'class',
  'data-testid',
  'from',
  'hash',
  'hashScrollIntoView',
  'ignoreBlocker',
  'inactiveProps',
  'mask',
  'onBlur',
  'onClick',
  'onFocus',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseOut',
  'onMouseOver',
  'onTouchStart',
  'params',
  'preload',
  'preloadDelay',
  'ref',
  'reloadDocument',
  'replace',
  'resetScroll',
  'search',
  'startTransition',
  'state',
  'style',
  'target',
  'to',
  'unsafeRelative',
  'viewTransition',
])

function canUseFastAnchor(props: Record<string, any>) {
  for (const key in props) {
    if (!FAST_ANCHOR_PROP_KEYS.has(key)) return false
  }

  return (
    isFastAnchorStateProps(props.activeProps) &&
    isFastAnchorStateProps(props.inactiveProps)
  )
}

function isFastAnchorStateProps(value: unknown) {
  if (value == null) return true
  if (typeof value !== 'object') return false

  for (const key in value) {
    if (key !== 'class' && key !== 'style') return false
  }

  return true
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function isSafeInternal(to: unknown) {
  if (typeof to !== 'string') return false
  const zero = to.charCodeAt(0)
  if (zero === 47) return to.charCodeAt(1) !== 47 // '/' but not '//'
  return zero === 46 // '.', '..', './', '../'
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
