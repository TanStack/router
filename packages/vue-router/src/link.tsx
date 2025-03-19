import * as Vue from 'vue'
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

import { splitProps, useIntersectionObserver } from './utils'

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
): Vue.ComponentProps<'a'> {
  const router = useRouter()
  const isTransitioning = Vue.ref(false)
  let hasRenderFetched = false

  const [local, rest] = splitProps(
    Vue.mergeProps(
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

  const [_, propsSafeToSpread] = Vue.splitProps(rest, [
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

  const type: Vue.Ref<'internal' | 'external'> = () => {
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
    from: from.value,
  })

  const next = Vue.computed(() => {
    currentSearch.value
    return router.buildLocation(_options() as any)
  })

  const preload = Vue.computed(() => {
    if (_options().reloadDocument) {
      return false
    }
    return local?.value.preload ?? router.options.defaultPreload
  })
  const preloadDelay = () =>
    local?.value.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      if (local?.value.activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next.value.pathname,
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
          next.value?.pathname,
          router.basepath,
        )?.split('/')

        const pathIsFuzzyEqual = nextPathSplit?.every(
          (d, i) => d === currentPathSplit[i],
        )
        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (local?.value.activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.value.search, {
          partial: !local?.value.activeOptions?.exact,
          ignoreUndefined: !local?.value.activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (local?.value.activeOptions?.includeHash) {
        return s.location.hash === next.value.hash
      }
      return true
    },
  })

  const doPreload = () =>
    router.preloadRoute(_options() as any).catch((err: any) => {
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

  const ref = Vue.ref<Element | null>(null)

  useIntersectionObserver(
    ref,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    { disabled: !!local?.value.disabled || !(preload.value === 'viewport') },
  )

  Vue.effect(() => {
    if (hasRenderFetched) {
      return
    }
    if (!local?.value.disabled && preload.value === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  if (type.value === 'external') {
    return Vue.mergeProps(
      propsSafeToSpread,
      {
        ref,
        get type() {
          return type.value
        },
        get href() {
          return local?.value.to
        },
      },
      splitProps(local, [
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
      !local?.value.disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!local?.value.target || local?.value.target === '_self') &&
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
        replace: local?.value.replace,
        resetScroll: local?.value.resetScroll,
        hashScrollIntoView: local?.value.hashScrollIntoView,
        startTransition: local?.value.startTransition,
        viewTransition: local?.value.viewTransition,
        ignoreBlocker: local?.value.ignoreBlocker,
      } as any)
    }
  }

  // The click handler
  const handleFocus = (_: MouseEvent) => {
    if (local?.value.disabled) return
    if (preload.value) {
      doPreload()
    }
  }

  const handleTouchStart = handleFocus

  const handleEnter = (e: MouseEvent) => {
    if (local?.value.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (preload.value) {
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
    if (local?.value.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (eventTarget.preloadTimeout) {
      clearTimeout(eventTarget.preloadTimeout)
      eventTarget.preloadTimeout = null
    }
  }

  /** Call a JSX.EventHandlerUnion with the event. */
  function callHandler<T, TEvent extends Event>(
    event: TEvent & { currentTarget: T; target: Element },
    handler: Vue.JSX.EventHandlerUnion<T, TEvent> | undefined,
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
    handlers: Array<Vue.JSX.EventHandlerUnion<T, any> | undefined>,
  ) {
    return (event: any) => {
      for (const handler of handlers) {
        callHandler(event, handler)
      }
    }
  }

  // Get the active props
  const resolvedActiveProps: () => Omit<Vue.ComponentProps<'a'>, 'style'> & {
    style?: Vue.JSX.CSSProperties
  } = () =>
    isActive.value ? (functionalUpdate(local?.value.activeProps as any, {}) ?? {}) : {}

  // Get the inactive props
  const resolvedInactiveProps: () => Omit<Vue.ComponentProps<'a'>, 'style'> & {
    style?: Vue.JSX.CSSProperties
  } = () => (isActive.value ? {} : functionalUpdate(local?.value.inactiveProps, {}))

  const resolvedClassName = () =>
    [local?.value.class, resolvedActiveProps().class, resolvedInactiveProps().class]
      .filter(Boolean)
      .join(' ')

  const resolvedStyle = () => ({
    ...local?.value.style,
    ...resolvedActiveProps().style,
    ...resolvedInactiveProps().style,
  })

  const href = Vue.computed(() => {
    const nextLocation = next.value
    const maskedLocation = nextLocation?.maskedLocation

    return _options().disabled
      ? undefined
      : maskedLocation
        ? router.history.createHref(maskedLocation.href)
        : router.history.createHref(nextLocation?.href)
  })

  return Vue.mergeProps(
    propsSafeToSpread,
    resolvedActiveProps,
    resolvedInactiveProps,
    () => {
      return {
        href: href.value,
        ref: mergeRefs(setRef, _options().ref),
        onClick: composeEventHandlers([local?.value.onClick, handleClick]),
        onFocus: composeEventHandlers([local?.value.onFocus, handleFocus]),
        onMouseEnter: composeEventHandlers([local?.value.onMouseEnter, handleEnter]),
        onMouseOver: composeEventHandlers([local?.value.onMouseOver, handleEnter]),
        onMouseLeave: composeEventHandlers([local?.value.onMouseLeave, handleLeave]),
        onMouseOut: composeEventHandlers([local?.value.onMouseOut, handleLeave]),
        onTouchStart: composeEventHandlers([
          local?.value.onTouchStart,
          handleTouchStart,
        ]),
        disabled: !!local?.value.disabled,
        target: local?.value.target,
        ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
        ...(resolvedClassName() && { class: resolvedClassName() }),
        ...(local?.value.disabled && {
          role: 'link',
          'aria-disabled': true,
        }),
        ...(isActive.value && { 'data-status': 'active', 'aria-current': 'page' }),
        ...(isTransitioning.value && { 'data-transitioning': 'transitioning' }),
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
  Omit<Vue.ComponentProps<'a'>, 'style'> & { style?: Vue.JSX.CSSProperties }

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
    | Vue.VNode
    | ((state: { isActive: boolean; isTransitioning: boolean }) => Vue.VNode)
}

type LinkComponentSolidProps<TComp> = TComp extends Vue.ValidComponent
  ? Omit<Vue.ComponentProps<TComp>, keyof CreateLinkProps>
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

export type LinkComponent<TComp> = <
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Vue.VNode

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Vue.VNode>,
): LinkComponent<TComp> {
  return (props) => <Link {...(props as any)} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props: any) => {
  const [local, rest] = splitProps(props, ['_asChild'])

  const [_, linkProps] = splitProps(useLinkProps(rest as unknown as any), [
    'type',
    'children',
  ])

  const children = () =>
    typeof rest?.value.children === 'function'
      ? rest?.value.children({
          get isActive() {
            return (linkProps as any)['data-status'] === 'active'
          },
        })
      : rest?.value.children

  return (
    <Dynamic component={local?.value._asChild ? local.value._asChild : 'a'} {...linkProps}>
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
