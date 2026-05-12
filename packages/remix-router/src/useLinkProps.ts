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
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  RegisteredRouter,
} from '@tanstack/router-core'
import type { LinkComponentProps } from './Link'

/**
 * Build anchor-like props for declarative navigation and preloading.
 *
 * Same shape as `useLinkProps` from `@tanstack/react-router`, but adapted
 * to the `remix/ui` model: takes a component `handle` plus a getter for
 * the current options, and returns a getter `() => props` that should be
 * spread onto an `<a>` (or compatible) element inside the render function.
 *
 * @example
 * ```tsx
 * function MyLink(handle: Handle<LinkComponentProps<'a'>>) {
 *   const linkProps = useLinkProps(handle, () => handle.props)
 *   return (props) => <a {...linkProps()}>{props.children}</a>
 * }
 * ```
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/useLinkPropsHook
 */
export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  handle: Handle<any, any>,
  getOptions: () => LinkComponentProps<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): () => Record<string, unknown> {
  const router = useRouter(handle)
  const readLocation = useLocation(handle)
  let isTransitioning = false
  // Track the last href we issued a render-time preload for so a `to`
  // swap on the same `useLinkProps` instance picks up the new
  // destination. See `Link.tsx` for the matching pattern.
  let lastPreloadedHref: string | undefined

  return () => {
    const options = getOptions() as LinkComponentProps<'a'>
    const {
      to,
      activeOptions,
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
      class: linkClass,
      className,
      style,
      activeProps,
      inactiveProps,
      onClick: userOnClick,
      onBlur: userOnBlur,
      onFocus: userOnFocus,
      onMouseEnter: userMouseEnter,
      onMouseLeave: userMouseLeave,
      onTouchStart: userTouchStart,
      reloadDocument,
      from,
      _fromLocation,
    } = options as any

    const next = router.buildLocation({
      ...(options as any),
      _fromLocation: readLocation(),
    })
    const display = next.maskedLocation ?? next
    const publicHref: string = display.publicHref
    const external: boolean = display.external

    let resolvedHref: string | undefined
    let isExternal = false
    if (disabled) {
      // no-op
    } else if (external) {
      if (isDangerousProtocol(publicHref, router.protocolAllowlist)) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Blocked Link with dangerous protocol: ${publicHref}`)
        }
      } else {
        resolvedHref = publicHref
        isExternal = true
      }
    } else if (
      typeof to === 'string' &&
      !isSafeInternal(to) &&
      to.indexOf(':') > -1
    ) {
      try {
        new URL(to)
        if (isDangerousProtocol(to, router.protocolAllowlist)) {
          if (process.env.NODE_ENV !== 'production') {
            console.warn(`Blocked Link with dangerous protocol: ${to}`)
          }
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

    const current = readLocation()
    let isActive = false
    if (!isExternal) {
      const opts = activeOptions
      if (opts?.exact) {
        isActive = exactPathTest(current.pathname, next.pathname, router.basepath)
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
      if (isActive && opts?.includeHash) isActive = current.hash === next.hash
    }

    const preload =
      reloadDocument || isExternal
        ? false
        : (userPreload ?? router.options.defaultPreload)
    const preloadDelay =
      userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

    const doPreload = () => {
      router
        .preloadRoute({ ...(options as any), _builtLocation: next })
        .catch((err: any) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
    }
    if (!disabled && preload === 'render' && next.href !== lastPreloadedHref) {
      lastPreloadedHref = next.href
      doPreload()
    }

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
        ...(options as any),
        replace,
        resetScroll,
        viewTransition,
        startTransition,
        ignoreBlocker,
        hashScrollIntoView,
      })
    }
    function enqueueIntent(e: MouseEvent | FocusEvent) {
      if (disabled || preload !== 'intent') return
      if (!preloadDelay) return doPreload()
      const t = (e.currentTarget ?? e.target)
      if (!t || timeoutMap.has(t)) return
      timeoutMap.set(
        t,
        setTimeout(() => {
          timeoutMap.delete(t)
          doPreload()
        }, preloadDelay),
      )
    }
    function handleLeave(e: MouseEvent | FocusEvent) {
      if (disabled) return
      const t = (e.currentTarget ?? e.target)
      if (t) {
        const id = timeoutMap.get(t)
        clearTimeout(id)
        timeoutMap.delete(t)
      }
    }
    function handleTouchStart(e: TouchEvent) {
      if (userTouchStart) userTouchStart(e)
      if (disabled || preload !== 'intent') return
      doPreload()
    }

    const useDefaultActive =
      activeProps === undefined &&
      inactiveProps === undefined &&
      linkClass === undefined &&
      className === undefined &&
      style === undefined

    const defaultActiveProps =
      isActive && useDefaultActive ? STATIC_DEFAULT_ACTIVE_ATTRIBUTES : EMPTY_OBJECT

    const computedActive =
      isActive && activeProps
        ? functionalUpdate(activeProps, {})
        : EMPTY_OBJECT
    const computedInactive =
      !isActive && inactiveProps
        ? functionalUpdate(inactiveProps, {})
        : EMPTY_OBJECT

    const mergedClass = [
      linkClass,
      className,
      (computedActive).class,
      (computedActive).className,
      (computedInactive).class,
      (computedInactive).className,
    ]
      .filter(Boolean)
      .join(' ')

    const mergedStyle = {
      ...(typeof style === 'object' ? (style) : null),
      ...((computedActive).style ?? null),
      ...((computedInactive).style ?? null),
    }

    return {
      href: resolvedHref,
      target,
      mix: [
        on<HTMLAnchorElement, 'click'>('click', handleClick as any),
        on<HTMLAnchorElement, 'pointerenter'>('pointerenter', enqueueIntent as any),
        on<HTMLAnchorElement, 'pointerleave'>('pointerleave', handleLeave as any),
        on<HTMLAnchorElement, 'focus'>('focus', enqueueIntent as any),
        on<HTMLAnchorElement, 'blur'>('blur', handleLeave as any),
        on<HTMLAnchorElement, 'touchstart'>('touchstart', handleTouchStart as any),
      ],
      ...(disabled ? STATIC_DISABLED_PROPS : null),
      ...(isTransitioning ? STATIC_TRANSITIONING_ATTRIBUTES : null),
      ...defaultActiveProps,
      ...computedActive,
      ...computedInactive,
      ...(Object.keys(mergedStyle).length > 0 ? { style: mergedStyle } : null),
      ...(mergedClass ? { class: mergedClass } : null),
      ...(isActive && !useDefaultActive ? STATIC_ACTIVE_ATTRIBUTES : null),
    }
  }
}
