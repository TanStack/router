/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { on } from '@remix-run/ui'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,

  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'
import { useRouter } from './useRouter'
import { useLocation } from './useLocation'
import {
  EMPTY_OBJECT,
  STATIC_ACTIVE_ATTRIBUTES,
  STATIC_DEFAULT_ACTIVE_ATTRIBUTES,
  STATIC_DISABLED_PROPS,
  STATIC_TRANSITIONING_ATTRIBUTES,
  isCtrlEvent,
  isSafeInternal,
  timeoutMap,
} from './linkInternals'
import type { Handle, RemixNode } from '@remix-run/ui'
import type {
  AnyRouter,
  Constrain,
  LinkOptions,
  RegisteredRouter,
} from '@tanstack/router-core'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

/** Subset of activeProps used by `<Link>`'s default-class shortcut. */
const STATIC_ACTIVE_PROPS = { class: 'active' }

export interface ActiveLinkOptionProps {
  /**
   * Props to merge in when the link is active. May be a function returning
   * the props to allow dynamic computation.
   */
  activeProps?:
    | Record<string, unknown>
    | (() => Record<string, unknown>)
  /**
   * Props to merge in when the link is inactive. Same shape as `activeProps`.
   */
  inactiveProps?:
    | Record<string, unknown>
    | (() => Record<string, unknown>)
}

export type ActiveLinkOptions<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  ActiveLinkOptionProps

export interface LinkPropsChildren {
  children?:
    | RemixNode
    | ((state: { isActive: boolean; isTransitioning: boolean }) => RemixNode)
}

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkPropsChildren & {
    target?: string
    disabled?: boolean
    style?: Record<string, unknown> | string
    class?: string
    className?: string
    onClick?: (event: MouseEvent) => void
    onBlur?: (event: FocusEvent) => void
    onFocus?: (event: FocusEvent) => void
    onMouseEnter?: (event: MouseEvent) => void
    onMouseLeave?: (event: MouseEvent) => void
    onTouchStart?: (event: TouchEvent) => void
    [key: `data-${string}`]: unknown
  }

/**
 * Type alias for a fully-typed Link options object.
 */
export type LinkProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

/**
 * Helper type used by `linkOptions()` so authors can build a typed argument
 * object once and reuse it across multiple `<Link>` instances.
 */
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
 * Helper that returns its argument unchanged but constrains it to be a
 * valid `LinkComponentProps<TComp>`. Use to build typed link option
 * objects for reuse.
 */
export const linkOptions: LinkOptionsFn<'a'> = (options) => options as any

function resolveSimpleStyle(
  active: boolean,
  options: LinkComponentProps<'a'>,
): Record<string, unknown> {
  const useDefaultActive =
    options.activeProps === undefined &&
    options.inactiveProps === undefined &&
    options.class === undefined &&
    options.className === undefined &&
    options.style === undefined

  if (useDefaultActive) {
    return active ? { ...STATIC_DEFAULT_ACTIVE_ATTRIBUTES } : {}
  }

  const activeProps =
    active && options.activeProps
      ? functionalUpdate(options.activeProps as any, {})
      : EMPTY_OBJECT
  const inactiveProps =
    !active && options.inactiveProps
      ? functionalUpdate(options.inactiveProps as any, {})
      : EMPTY_OBJECT

  const className = [
    options.class,
    options.className,
    (activeProps).class,
    (activeProps).className,
    (inactiveProps).class,
    (inactiveProps).className,
  ]
    .filter(Boolean)
    .join(' ')

  const style: Record<string, unknown> = {
    ...(typeof options.style === 'object' ? (options.style as any) : null),
    ...((activeProps).style ?? null),
    ...((inactiveProps).style ?? null),
  }

  return {
    ...activeProps,
    ...inactiveProps,
    ...(Object.keys(style).length > 0 ? { style } : null),
    ...(className ? { class: className } : null),
    ...(active ? STATIC_ACTIVE_ATTRIBUTES : null),
  }
}

/**
 * Type-safe client-side navigation link. Renders an `<a>` element.
 *
 * Mirrors `<Link>` from `@tanstack/react-router` (option-compatible) but
 * built against `@remix-run/ui`'s factory component model.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/linkComponent
 */
export function Link(handle: Handle<LinkComponentProps<'a'>>) {
  const router = useRouter(handle)
  const readLocation = useLocation(handle)

  // Setup-time mutable state — reads happen in the render function below,
  // and `handle.update()` triggers a re-render whenever they change.
  let isTransitioning = false
  // Last href we issued a render-time preload for. Resetting on `next.href`
  // change means a `<Link to="/a" preload="render">` instance whose `to`
  // gets swapped to `/b` will preload `/b` too, instead of being stuck on
  // the destination it first mounted with.
  let lastPreloadedHref: string | undefined

  return (props: LinkComponentProps<'a'>): RemixNode => {
    const {
      activeProps: _activeProps,
      inactiveProps: _inactiveProps,
      activeOptions,
      to,
      preload: userPreload,
      preloadDelay: userPreloadDelay,
      replace,
      resetScroll,
      viewTransition,
      startTransition,
      ignoreBlocker,
      hashScrollIntoView,
      target,
      disabled,
      style: _style,
      class: _class,
      className: _className,
      onClick: userOnClick,
      onBlur: userOnBlur,
      onFocus: userOnFocus,
      onMouseEnter: userMouseEnter,
      onMouseLeave: userMouseLeave,
      onTouchStart: userTouchStart,
      params: _params,
      search: _search,
      hash: _hash,
      state: _state,
      mask: _mask,
      reloadDocument: _reloadDocument,
      unsafeRelative: _unsafeRelative,
      from: _from,
      _fromLocation,
      children,
      ...propsSafeToSpread
    } = props as any

    // Build the target location.
    const next = router.buildLocation({
      ...(props as any),
      _fromLocation: readLocation(),
    })

    const display = next.maskedLocation ?? next
    const publicHref: string = display.publicHref
    const external: boolean = display.external

    // Resolve href + dangerous-protocol guards.
    let resolvedHref: string | undefined
    let isExternal = false
    if (disabled) {
      resolvedHref = undefined
    } else if (external) {
      if (isDangerousProtocol(publicHref, router.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${publicHref}`)
        }
        resolvedHref = undefined
      } else {
        resolvedHref = publicHref
        isExternal = true
      }
    } else if (
      typeof to === 'string' &&
      !isSafeInternal(to) &&
      to.indexOf(':') > -1
    ) {
      // Absolute URL provided as `to` — treat as external.
      try {
        new URL(to)
        if (isDangerousProtocol(to, router.protocolAllowlist)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked Link with dangerous protocol: ${to}`)
          }
          resolvedHref = undefined
        } else {
          resolvedHref = to
          isExternal = true
        }
      } catch {
        resolvedHref = router.history.createHref(publicHref) || '/'
      }
    } else {
      resolvedHref = router.history.createHref(publicHref) || '/'
    }

    // ===== Active state =====
    const current = readLocation()
    let isActive = false
    if (!isExternal) {
      const opts = activeOptions
      if (opts?.exact) {
        isActive = exactPathTest(
          current.pathname,
          next.pathname,
          router.basepath,
        )
      } else {
        const cur = removeTrailingSlash(current.pathname, router.basepath)
        const nx = removeTrailingSlash(next.pathname, router.basepath)
        isActive =
          cur.startsWith(nx) &&
          (cur.length === nx.length || cur[nx.length] === '/')
      }
      if (isActive && (opts?.includeSearch ?? true)) {
        isActive = deepEqual(current.search, next.search, {
          partial: !opts?.exact,
          ignoreUndefined: !opts?.explicitUndefined,
        })
      }
      if (isActive && opts?.includeHash) {
        isActive = current.hash === next.hash
      }
    }

    // ===== Preload behaviour =====
    const preload =
      props.reloadDocument || isExternal
        ? false
        : (userPreload ?? router.options.defaultPreload)
    const preloadDelay =
      userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

    function doPreload() {
      router
        .preloadRoute({ ...(props as any), _builtLocation: next })
        .catch((err: any) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
    }

    // Re-fire preload when the destination changes — `next.href` is the
    // canonical resolved href, so swapping `to` from "/a" to "/b" on the
    // same `<Link>` instance will trigger a preload for "/b".
    if (!disabled && preload === 'render' && next.href !== lastPreloadedHref) {
      lastPreloadedHref = next.href
      doPreload()
    }

    // ===== Event handlers =====
    function handleClick(e: MouseEvent) {
      if (userOnClick) userOnClick(e)
      if (e.defaultPrevented) return
      if (
        disabled ||
        isCtrlEvent(e) ||
        e.button !== 0 ||
        (target && target !== '_self')
      ) {
        return
      }
      e.preventDefault()
      isTransitioning = true
      void handle.update()
      const unsub = router.subscribe('onResolved', () => {
        unsub()
        isTransitioning = false
        void handle.update()
      })
      router.navigate({
        ...(props as any),
        replace,
        resetScroll,
        viewTransition,
        startTransition,
        ignoreBlocker,
        hashScrollIntoView,
      })
    }

    function enqueueIntentPreload(e: MouseEvent | FocusEvent) {
      if (disabled || preload !== 'intent') return
      if (!preloadDelay) {
        doPreload()
        return
      }
      const eventTarget = (e.currentTarget ?? e.target)
      if (!eventTarget || timeoutMap.has(eventTarget)) return
      timeoutMap.set(
        eventTarget,
        setTimeout(() => {
          timeoutMap.delete(eventTarget)
          doPreload()
        }, preloadDelay),
      )
    }

    function handleLeave(e: MouseEvent | FocusEvent) {
      if (disabled) return
      const eventTarget = e.currentTarget ?? e.target
      if (eventTarget) {
        const id = timeoutMap.get(eventTarget)
        clearTimeout(id)
        timeoutMap.delete(eventTarget)
      }
    }

    function handleTouchStart(e: TouchEvent) {
      if (userTouchStart) userTouchStart(e)
      if (disabled || preload !== 'intent') return
      doPreload()
    }

    // ===== Resolve children =====
    let resolvedChildren: RemixNode = null
    if (typeof children === 'function') {
      resolvedChildren = (children)({ isActive, isTransitioning })
    } else if (children !== undefined) {
      resolvedChildren = children as RemixNode
    }

    // ===== Compose final props =====
    const stateProps = resolveSimpleStyle(isActive, props)

    const eventMixins = [
      on<HTMLAnchorElement, 'click'>('click', handleClick as any),
      on<HTMLAnchorElement, 'pointerenter'>(
        'pointerenter',
        enqueueIntentPreload as any,
      ),
      on<HTMLAnchorElement, 'pointerleave'>(
        'pointerleave',
        handleLeave as any,
      ),
      on<HTMLAnchorElement, 'focus'>('focus', enqueueIntentPreload as any),
      on<HTMLAnchorElement, 'blur'>('blur', handleLeave as any),
      on<HTMLAnchorElement, 'touchstart'>('touchstart', handleTouchStart as any),
    ]

    return (
      <a
        href={resolvedHref}
        target={target}
        mix={eventMixins}
        {...(propsSafeToSpread)}
        {...(disabled ? STATIC_DISABLED_PROPS : null)}
        {...(isTransitioning ? STATIC_TRANSITIONING_ATTRIBUTES : null)}
        {...(stateProps as any)}
      >
        {resolvedChildren}
      </a>
    )
  }
}

/**
 * @internal — convenience export of the active default class.
 */
export { STATIC_ACTIVE_PROPS }

/**
 * Generic component constraint matching `createLink` from React/Solid bindings.
 * This binding does not yet ship a `createLink` factory because `remix/ui`
 * doesn't have a `Dynamic`-style component primitive. Track in follow-up.
 */
export type CreateLinkProps = LinkProps<'a', any, string, string, string, string>

export type LinkComponent<TComp = 'a', TDefaultFrom extends string = string> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = TDefaultFrom,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => RemixNode

/**
 * Produces a typed `<Link>` component bound to a specific underlying tag.
 * Currently `'a'` only; a richer factory lands once `remix/ui` exposes a
 * dynamic-component primitive.
 */
export function createLink<const TComp>(
  _Comp: Constrain<TComp, any, (props: CreateLinkProps) => RemixNode>,
): LinkComponent<TComp> {
  return Link as any
}
