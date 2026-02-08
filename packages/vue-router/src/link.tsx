import * as Vue from 'vue'
import {
  deepEqual,
  exactPathTest,
  isDangerousProtocol,
  preloadWarning,
  removeTrailingSlash,
} from '@tanstack/router-core'

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
import type { AnchorHTMLAttributes, ReservedProps } from '@vue/runtime-dom'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

type EventHandler<TEvent = Event> = (e: TEvent) => void

type DataAttributes = {
  [K in `data-${string}`]?: unknown
}

type LinkHTMLAttributes = AnchorHTMLAttributes &
  ReservedProps &
  DataAttributes & {
    // Vue's runtime-dom types use lowercase event names.
    // Also accept camelCase versions for external API compatibility.
    onMouseEnter?: EventHandler<MouseEvent>
    onMouseLeave?: EventHandler<MouseEvent>
    onMouseOver?: EventHandler<MouseEvent>
    onMouseOut?: EventHandler<MouseEvent>
    onTouchStart?: EventHandler<TouchEvent>

    // `disabled` is not a valid <a> attribute, but is useful when using `asChild`.
    disabled?: boolean
  }

interface StyledProps {
  class?: LinkHTMLAttributes['class']
  style?: LinkHTMLAttributes['style']
  [key: string]: unknown
}

type PropsOfComponent<TComp> =
  // Functional components
  TComp extends (props: infer P, ...args: Array<unknown>) => any
    ? P
    : // Vue components (defineComponent, class components, etc)
      TComp extends Vue.Component<infer P>
      ? P
      : Record<string, unknown>

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): LinkHTMLAttributes {
  const router = useRouter()
  const isTransitioning = Vue.ref(false)
  let hasRenderFetched = false

  // Ensure router is defined before proceeding
  if (!router) {
    console.warn('useRouter must be used inside a <RouterProvider> component!')
    return {}
  }

  // Determine if the link is external or internal
  const type = Vue.computed(() => {
    try {
      new URL(`${options.to}`)
      return 'external'
    } catch {
      return 'internal'
    }
  })

  const currentSearch = useRouterState({
    select: (s) => s.location.searchStr,
  })

  // when `from` is not supplied, use the leaf route of the current matches as the `from` location
  const from = useMatches({
    select: (matches) => options.from ?? matches[matches.length - 1]?.fullPath,
  })

  const _options = Vue.computed(() => ({
    ...options,
    from: from.value,
  }))

  const next = Vue.computed(() => {
    // Depend on search to rebuild when search changes
    currentSearch.value
    return router.buildLocation(_options.value as any)
  })

  const preload = Vue.computed(() => {
    if (_options.value.reloadDocument) {
      return false
    }
    return options.preload ?? router.options.defaultPreload
  })

  const preloadDelay = Vue.computed(
    () => options.preloadDelay ?? router.options.defaultPreloadDelay ?? 0,
  )

  const isActive = useRouterState({
    select: (s) => {
      const activeOptions = options.activeOptions
      if (activeOptions?.exact) {
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

      if (activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.value.search, {
          partial: !activeOptions?.exact,
          ignoreUndefined: !activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (activeOptions?.includeHash) {
        return s.location.hash === next.value.hash
      }
      return true
    },
  })

  const doPreload = () =>
    router.preloadRoute(_options.value as any).catch((err: any) => {
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
    { disabled: () => !!options.disabled || !(preload.value === 'viewport') },
  )

  Vue.effect(() => {
    if (hasRenderFetched) {
      return
    }
    if (!options.disabled && preload.value === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  // Create safe props that can be spread
  const getPropsSafeToSpread = () => {
    const result: Record<string, any> = {}
    const optionRecord = options as unknown as Record<string, unknown>
    for (const key in options) {
      if (
        ![
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
          'params',
          'search',
          'hash',
          'state',
          'mask',
          'reloadDocument',
          '_asChild',
          'from',
          'additionalProps',
        ].includes(key)
      ) {
        result[key] = optionRecord[key]
      }
    }
    return result
  }

  if (type.value === 'external') {
    // Block dangerous protocols like javascript:, data:, vbscript:
    if (isDangerousProtocol(options.to as string)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`Blocked Link with dangerous protocol: ${options.to}`)
      }
      // Return props without href to prevent navigation
      const safeProps: Record<string, unknown> = {
        ...getPropsSafeToSpread(),
        ref,
        // No href attribute - blocks the dangerous protocol
        target: options.target,
        disabled: options.disabled,
        style: options.style,
        class: options.class,
        onClick: options.onClick,
        onFocus: options.onFocus,
        onMouseEnter: options.onMouseEnter,
        onMouseLeave: options.onMouseLeave,
        onMouseOver: options.onMouseOver,
        onMouseOut: options.onMouseOut,
        onTouchStart: options.onTouchStart,
      }

      // Remove undefined values
      Object.keys(safeProps).forEach((key) => {
        if (safeProps[key] === undefined) {
          delete safeProps[key]
        }
      })

      return safeProps as LinkHTMLAttributes
    }

    // External links just have simple props
    const externalProps: Record<string, unknown> = {
      ...getPropsSafeToSpread(),
      ref,
      href: options.to,
      target: options.target,
      disabled: options.disabled,
      style: options.style,
      class: options.class,
      onClick: options.onClick,
      onFocus: options.onFocus,
      onMouseEnter: options.onMouseEnter,
      onMouseLeave: options.onMouseLeave,
      onMouseOver: options.onMouseOver,
      onMouseOut: options.onMouseOut,
      onTouchStart: options.onTouchStart,
    }

    // Remove undefined values
    Object.keys(externalProps).forEach((key) => {
      if (externalProps[key] === undefined) {
        delete externalProps[key]
      }
    })

    return externalProps as LinkHTMLAttributes
  }

  // The click handler
  const handleClick = (e: PointerEvent): void => {
    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    )?.getAttribute('target')
    const effectiveTarget =
      options.target !== undefined ? options.target : elementTarget

    if (
      !options.disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      // Don't prevent default or handle navigation if reloadDocument is true
      if (_options.value.reloadDocument) {
        return
      }

      e.preventDefault()

      isTransitioning.value = true

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        isTransitioning.value = false
      })

      // All is well? Navigate!
      router.navigate({
        ..._options.value,
        replace: options.replace,
        resetScroll: options.resetScroll,
        hashScrollIntoView: options.hashScrollIntoView,
        startTransition: options.startTransition,
        viewTransition: options.viewTransition,
        ignoreBlocker: options.ignoreBlocker,
      })
    }
  }

  // The focus handler
  const handleFocus = (_: FocusEvent) => {
    if (options.disabled) return
    if (preload.value) {
      doPreload()
    }
  }

  const handleTouchStart = (_: TouchEvent) => {
    if (options.disabled) return
    if (preload.value) {
      doPreload()
    }
  }

  const handleEnter = (e: MouseEvent) => {
    if (options.disabled) return
    // Use currentTarget (the element with the handler) instead of target (which may be a child)
    const eventTarget = (e.currentTarget ||
      e.target ||
      {}) as LinkCurrentTargetElement

    if (preload.value) {
      if (eventTarget.preloadTimeout) {
        return
      }

      eventTarget.preloadTimeout = setTimeout(() => {
        eventTarget.preloadTimeout = null
        doPreload()
      }, preloadDelay.value)
    }
  }

  const handleLeave = (e: MouseEvent) => {
    if (options.disabled) return
    // Use currentTarget (the element with the handler) instead of target (which may be a child)
    const eventTarget = (e.currentTarget ||
      e.target ||
      {}) as LinkCurrentTargetElement

    if (eventTarget.preloadTimeout) {
      clearTimeout(eventTarget.preloadTimeout)
      eventTarget.preloadTimeout = null
    }
  }

  // Helper to compose event handlers - with explicit return type and better type handling
  function composeEventHandlers<T extends Event>(
    handlers: Array<EventHandler<T> | undefined>,
  ): (e: T) => void {
    return (event: T) => {
      for (const handler of handlers) {
        if (handler) {
          handler(event)
        }
      }
    }
  }

  // Get the active and inactive props
  const resolvedActiveProps = Vue.computed<StyledProps>(() => {
    const activeProps = options.activeProps || (() => ({ class: 'active' }))
    const props = isActive.value
      ? typeof activeProps === 'function'
        ? activeProps()
        : activeProps
      : {}

    return props || { class: undefined, style: undefined }
  })

  const resolvedInactiveProps = Vue.computed<StyledProps>(() => {
    const inactiveProps = options.inactiveProps || (() => ({}))
    const props = isActive.value
      ? {}
      : typeof inactiveProps === 'function'
        ? inactiveProps()
        : inactiveProps

    return props || { class: undefined, style: undefined }
  })

  const resolvedClassName = Vue.computed(() => {
    const classes = [
      options.class,
      resolvedActiveProps.value?.class,
      resolvedInactiveProps.value?.class,
    ].filter(Boolean)
    return classes.length ? classes.join(' ') : undefined
  })

  const resolvedStyle = Vue.computed(() => {
    const result: Record<string, string | number> = {}

    // Merge styles from all sources
    if (options.style) {
      Object.assign(result, options.style)
    }

    if (resolvedActiveProps.value?.style) {
      Object.assign(result, resolvedActiveProps.value.style)
    }

    if (resolvedInactiveProps.value?.style) {
      Object.assign(result, resolvedInactiveProps.value.style)
    }

    return Object.keys(result).length > 0 ? result : undefined
  })

  const href = Vue.computed(() => {
    if (options.disabled) {
      return undefined
    }
    const nextLocation = next.value
    const location = nextLocation?.maskedLocation ?? nextLocation

    // Use publicHref - it contains the correct href for display
    // When a rewrite changes the origin, publicHref is the full URL
    // Otherwise it's the origin-stripped path
    // This avoids constructing URL objects in the hot path
    const publicHref = location?.publicHref
    if (!publicHref) return undefined

    const external = location?.external
    if (external) return publicHref

    return router.history.createHref(publicHref) || '/'
  })

  // Create static event handlers that don't change between renders
  const staticEventHandlers = {
    onClick: composeEventHandlers<PointerEvent>([
      options.onClick,
      handleClick,
    ]) as any,
    onFocus: composeEventHandlers<FocusEvent>([
      options.onFocus,
      handleFocus,
    ]) as any,
    onMouseenter: composeEventHandlers<MouseEvent>([
      options.onMouseEnter,
      handleEnter,
    ]) as any,
    onMouseover: composeEventHandlers<MouseEvent>([
      options.onMouseOver,
      handleEnter,
    ]) as any,
    onMouseleave: composeEventHandlers<MouseEvent>([
      options.onMouseLeave,
      handleLeave,
    ]) as any,
    onMouseout: composeEventHandlers<MouseEvent>([
      options.onMouseOut,
      handleLeave,
    ]) as any,
    onTouchstart: composeEventHandlers<TouchEvent>([
      options.onTouchStart,
      handleTouchStart,
    ]) as any,
  }

  // Compute all props synchronously to avoid hydration mismatches
  // Using Vue.computed ensures props are calculated at render time, not after
  const computedProps = Vue.computed<LinkHTMLAttributes>(() => {
    const result: Record<string, unknown> = {
      ...getPropsSafeToSpread(),
      href: href.value,
      ref,
      ...staticEventHandlers,
      disabled: !!options.disabled,
      target: options.target,
    }

    // Add style if present
    if (resolvedStyle.value) {
      result.style = resolvedStyle.value
    }

    // Add class if present
    if (resolvedClassName.value) {
      result.class = resolvedClassName.value
    }

    // Add disabled props
    if (options.disabled) {
      result.role = 'link'
      result['aria-disabled'] = true
    }

    // Add active status
    if (isActive.value) {
      result['data-status'] = 'active'
      result['aria-current'] = 'page'
    }

    // Add transitioning status
    if (isTransitioning.value) {
      result['data-transitioning'] = 'transitioning'
    }

    // Merge active/inactive props (excluding class and style which are handled above)
    const activeP = resolvedActiveProps.value
    const inactiveP = resolvedInactiveProps.value

    for (const key of Object.keys(activeP)) {
      if (key !== 'class' && key !== 'style') {
        result[key] = (activeP as any)[key]
      }
    }
    for (const key of Object.keys(inactiveP)) {
      if (key !== 'class' && key !== 'style') {
        result[key] = (inactiveP as any)[key]
      }
    }

    return result as LinkHTMLAttributes
  })

  // Return the computed ref itself - callers should access .value
  return computedProps as unknown as LinkHTMLAttributes
}

// Type definitions
export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkHTMLAttributes

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
  (TComp extends keyof HTMLElementTagNameMap
    ? LinkHTMLAttributes
    : PropsOfComponent<TComp>) & {
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
    | Vue.VNodeChild
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => Vue.VNodeChild)
}

type LinkComponentVueProps<TComp> = TComp extends keyof HTMLElementTagNameMap
  ? Omit<LinkHTMLAttributes, keyof CreateLinkProps>
  : Omit<PropsOfComponent<TComp>, keyof CreateLinkProps>

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentVueProps<TComp> &
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
) => Vue.VNode

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
  ): Vue.VNode
}

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Vue.VNode>,
): LinkComponent<TComp> {
  return Vue.defineComponent({
    name: 'CreatedLink',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      return () => Vue.h(LinkImpl as any, { ...attrs, _asChild: Comp }, slots)
    },
  }) as any
}

const LinkImpl = Vue.defineComponent({
  name: 'Link',
  inheritAttrs: false,
  props: [
    '_asChild',
    'to',
    'preload',
    'preloadDelay',
    'activeProps',
    'inactiveProps',
    'activeOptions',
    'from',
    'search',
    'params',
    'hash',
    'state',
    'mask',
    'reloadDocument',
    'disabled',
    'additionalProps',
    'viewTransition',
    'resetScroll',
    'startTransition',
    'hashScrollIntoView',
    'replace',
    'ignoreBlocker',
    'target',
  ],
  setup(props, { attrs, slots }) {
    // Call useLinkProps ONCE during setup with combined props and attrs
    // The returned object is a computed ref that updates reactively
    const allProps = { ...props, ...attrs }
    const linkPropsComputed = useLinkProps(
      allProps as any,
    ) as unknown as Vue.ComputedRef<LinkHTMLAttributes>

    return () => {
      const Component = props._asChild || 'a'

      // Access the computed value to get fresh props each render
      const linkProps = linkPropsComputed.value

      const isActive = linkProps['data-status'] === 'active'
      const isTransitioning =
        linkProps['data-transitioning'] === 'transitioning'

      // Create the slot content or empty array if no default slot
      const slotContent = slots.default
        ? slots.default({
            isActive,
            isTransitioning,
          })
        : []

      // Special handling for SVG links - wrap an <a> inside the SVG
      if (Component === 'svg') {
        // Create props without class for svg link
        const svgLinkProps = { ...linkProps }
        delete svgLinkProps.class
        return Vue.h('svg', {}, [Vue.h('a', svgLinkProps, slotContent)])
      }

      // For custom functional components (non-string), pass children as a prop
      // since they may expect children as a prop like in Solid
      if (typeof Component !== 'string') {
        return Vue.h(
          Component,
          { ...linkProps, children: slotContent },
          slotContent,
        )
      }

      // Return the component with props and children
      return Vue.h(Component, linkProps, slotContent)
    }
  },
})

/**
 * Link component with proper TypeScript generics support
 */
export const Link = LinkImpl as unknown as Vue.Component<unknown> &
  Vue.Component<CreateLinkProps> &
  LinkComponent<'a'>

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
