import * as Solid from 'solid-js'

import { mergeRefs } from '@solid-primitives/refs'

import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
  hasKeys,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

import { isServer } from '@tanstack/router-core/isServer'
import { Dynamic } from 'solid-js/web'
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
  const router = useRouter()
  const shouldHydrateHash = !isServer && !!router.options.ssr
  const hasHydrated = useHydrated()

  let hasRenderFetched = false

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
  ])

  const currentLocation = Solid.createMemo(
    () => router.stores.location.get(),
    undefined,
    { equals: (prev, next) => prev.href === next.href },
  )

  type LinkState = readonly [
    href: string | undefined,
    external: string | undefined,
    active: boolean,
  ]

  let nextLocation: ReturnType<typeof router.buildLocation>

  const linkState = Solid.createMemo(
    (previous: LinkState | undefined): LinkState => {
      const current = currentLocation()
      // Rebuild when inherited search/hash or the current route context changes.
      const nextOptions = { _fromLocation: current, ...options } as any
      // untrack because router-core will also access stores, which are signals in solid
      nextLocation = Solid.untrack(() => router.buildLocation(nextOptions))
      const location = nextLocation.maskedLocation ?? nextLocation
      const publicHref = location.publicHref
      const href = options.disabled
        ? undefined
        : location.external
          ? publicHref
          : router.history.createHref(publicHref) || '/'

      let external: string | undefined
      if (href !== undefined && location.external) {
        // Block dangerous protocols for external links
        if (isDangerousProtocol(href, router.protocolAllowlist)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked Link with dangerous protocol: ${href}`)
          }
        } else {
          external = href
        }
      } else {
        const to = options.to
        if (
          !isSafeInternal(to) &&
          typeof to === 'string' &&
          to.indexOf(':') !== -1
        ) {
          try {
            new URL(to)
            // Block dangerous protocols like javascript:, blob:, data:
            if (isDangerousProtocol(to, router.protocolAllowlist)) {
              if (process.env.NODE_ENV !== 'production') {
                console.warn(`Blocked Link with dangerous protocol: ${to}`)
              }
            } else {
              external = to
            }
          } catch {}
        }
      }

      let active = false
      if (external === undefined) {
        const activeOptions = local.activeOptions
        if (activeOptions?.exact) {
          active = exactPathTest(
            current.pathname,
            nextLocation.pathname,
            router.basepath,
          )
        } else {
          const currentPath = removeTrailingSlash(
            current.pathname,
            router.basepath,
          )
          const nextPath = removeTrailingSlash(
            nextLocation.pathname,
            router.basepath,
          )
          active =
            currentPath.startsWith(nextPath) &&
            (currentPath.length === nextPath.length ||
              currentPath[nextPath.length] === '/')
        }

        if (active && (activeOptions?.includeSearch ?? true)) {
          active = deepEqual(current.search, nextLocation.search, {
            partial: !activeOptions?.exact,
            ignoreUndefined: !activeOptions?.explicitUndefined,
          })
        }

        if (active && activeOptions?.includeHash) {
          const currentHash =
            shouldHydrateHash && !hasHydrated() ? '' : current.hash
          active = currentHash === nextLocation.hash
        }
      }

      if (
        previous &&
        previous[0] === href &&
        previous[1] === external &&
        previous[2] === active
      ) {
        return previous
      }
      return [href, external, active]
    },
  )

  const externalLink = () => linkState()[1]

  const preload = Solid.createMemo(() => {
    if (options.reloadDocument || externalLink() || local.disabled) {
      return false
    }
    return local.preload ?? router.options.defaultPreload
  })
  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const doPreload = () => {
    // Refresh the privately held location even when published link state is stable.
    linkState()
    return router
      .preloadRoute({ ...options, _builtLocation: nextLocation } as any)
      .catch((err: any) => {
        console.warn(err)
        console.warn(preloadWarning)
      })
  }

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

  useIntersectionObserver(ref, enqueuePreload, () => preload() !== 'viewport')

  Solid.createEffect(() => {
    if (hasRenderFetched) {
      return
    }
    if (preload() === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  if (externalLink()) {
    return Solid.mergeProps(
      propsSafeToSpread,
      {
        ref: mergeRefs(setRef, options.ref),
        href: externalLink(),
      },
      Solid.splitProps(local, [
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
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      e.preventDefault()

      // All is well? Navigate!
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      router.navigate({
        ...options,
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
    if (preload() !== 'intent') return
    doPreload()
  }

  const handleLeave = () => {
    if (preload() === 'intent') {
      cancelPreload(ref)
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

  type ResolvedLinkStateProps = Omit<Solid.ComponentProps<'a'>, 'style'> & {
    style?: Solid.JSX.CSSProperties
  }

  const resolvedProps = Solid.createMemo(() => {
    const state = linkState()
    const active = state[2]

    const base = {
      href: state[0],
      ref: mergeRefs(setRef, options.ref),
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
      ...(hasKeys(style) ? { style } : undefined),
      ...(className ? { class: className } : undefined),
      ...(active && STATIC_ACTIVE_ATTRIBUTES),
    } as ResolvedLinkStateProps
  })

  return Solid.mergeProps(propsSafeToSpread, resolvedProps) as any
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
