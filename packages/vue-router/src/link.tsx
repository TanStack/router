import * as Vue from 'vue'
import {
  deepEqual,
  exactPathTest,
  functionalUpdate,
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
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

// Type definitions to replace missing Vue JSX types
type EventHandler<E = Event> = (e: E) => void
interface HTMLAttributes {
  class?: string
  style?: Record<string, string | number>
  onClick?: EventHandler<MouseEvent>
  onFocus?: EventHandler<FocusEvent>
  onMouseEnter?: EventHandler<MouseEvent>
  onMouseLeave?: EventHandler<MouseEvent>
  onMouseOver?: EventHandler<MouseEvent>
  onMouseOut?: EventHandler<MouseEvent>
  onTouchStart?: EventHandler<TouchEvent>
  [key: string]: any
}

interface StyledProps {
  class?: string
  style?: Record<string, string | number>
}

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): HTMLAttributes {
  const router = useRouter()
  const isTransitioning = Vue.ref(false)
  let hasRenderFetched = false

  // Ensure router is defined before proceeding
  if (!router) {
    console.warn('useRouter must be used inside a <RouterProvider> component!')
    return {}
  }

  // Extract link-specific props and leave the rest
  const activeProps = options.activeProps || (() => ({ class: 'active' }))
  const inactiveProps = options.inactiveProps || (() => ({}))
  const activeOptions = options.activeOptions
  const to = options.to
  const preloadOption = options.preload
  const preloadDelayOption = options.preloadDelay
  const hashScrollIntoView = options.hashScrollIntoView
  const replace = options.replace
  const startTransition = options.startTransition
  const resetScroll = options.resetScroll
  const viewTransition = options.viewTransition
  const children = options.children
  const target = options.target
  const disabled = options.disabled
  const styleOption = options.style
  const classOption = options.class
  const onClick = options.onClick
  const onFocus = options.onFocus
  const onMouseEnter = options.onMouseEnter
  const onMouseLeave = options.onMouseLeave
  const onMouseOver = options.onMouseOver
  const onMouseOut = options.onMouseOut
  const onTouchStart = options.onTouchStart
  const ignoreBlocker = options.ignoreBlocker

  // Create safe props that can be spread
  const propsSafeToSpread: Record<string, any> = {}
  for (const key in options) {
    if (![
      'activeProps', 'inactiveProps', 'activeOptions', 'to', 'preload',
      'preloadDelay', 'hashScrollIntoView', 'replace', 'startTransition',
      'resetScroll', 'viewTransition', 'children', 'target', 'disabled',
      'style', 'class', 'onClick', 'onFocus', 'onMouseEnter', 'onMouseLeave',
      'onMouseOver', 'onMouseOut', 'onTouchStart', 'ignoreBlocker',
      'params', 'search', 'hash', 'state', 'mask', 'reloadDocument'
    ].includes(key)) {
      propsSafeToSpread[key] = options[key]
    }
  }

  // Determine if the link is external or internal
  const type = Vue.computed(() => {
    try {
      new URL(`${to}`)
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
    return preloadOption ?? router.options.defaultPreload
  })
  
  const preloadDelay = Vue.computed(() => 
    preloadDelayOption ?? router.options.defaultPreloadDelay ?? 0
  )

  const isActive = useRouterState({
    select: (s) => {
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
    { disabled: !!disabled || !(preload.value === 'viewport') },
  )

  Vue.effect(() => {
    if (hasRenderFetched) {
      return
    }
    if (!disabled && preload.value === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  if (type.value === 'external') {
    // External links just have simple props
    const externalProps: HTMLAttributes = {
      ...propsSafeToSpread,
      ref,
      href: to,
      target,
      disabled,
      style: styleOption,
      class: classOption,
      onClick,
      onFocus,
      onMouseEnter,
      onMouseLeave,
      onMouseOver,
      onMouseOut,
      onTouchStart,
    }
    
    // Remove undefined values
    Object.keys(externalProps).forEach(key => {
      if (externalProps[key] === undefined) {
        delete externalProps[key]
      }
    })
    
    return externalProps
  }

  // The click handler
  const handleClick = (e: MouseEvent) => {
    if (
      !disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!target || target === '_self') &&
      e.button === 0
    ) {
      // Don't prevent default or handle navigation if reloadDocument is true
      if (_options.value.reloadDocument) {
        return;
      }
      
      e.preventDefault()

      isTransitioning.value = true

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        isTransitioning.value = false
      })

      // All is well? Navigate!
      return router.navigate({
        ..._options.value,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      } as any)
    }
  }

  // The focus handler
  const handleFocus = (_: FocusEvent) => {
    if (disabled) return
    if (preload.value) {
      doPreload()
    }
  }

  const handleTouchStart = (_: TouchEvent) => {
    if (disabled) return
    if (preload.value) {
      doPreload()
    }
  }

  const handleEnter = (e: MouseEvent) => {
    if (disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

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
    if (disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

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
    const props = isActive.value ? 
      (typeof activeProps === 'function' ? activeProps() : activeProps) : 
      {}
    
    return props || { class: undefined, style: undefined }
  })

  const resolvedInactiveProps = Vue.computed<StyledProps>(() => {
    const props = isActive.value ? 
      {} : 
      (typeof inactiveProps === 'function' ? inactiveProps() : inactiveProps)
    
    return props || { class: undefined, style: undefined }
  })

  const resolvedClassName = Vue.computed(() => {
    const classes = [
      classOption, 
      resolvedActiveProps.value?.class, 
      resolvedInactiveProps.value?.class
    ].filter(Boolean)
    return classes.length ? classes.join(' ') : undefined
  })

  const resolvedStyle = Vue.computed(() => {
    const result: Record<string, string | number> = {}
    
    // Merge styles from all sources
    if (styleOption) {
      Object.assign(result, styleOption)
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
    const nextLocation = next.value
    const maskedLocation = nextLocation?.maskedLocation

    return disabled
      ? undefined
      : maskedLocation
        ? router.history.createHref(maskedLocation.href)
        : router.history.createHref(nextLocation?.href)
  })

  // Combine all props
  const result = Vue.computed(() => {
    const props: HTMLAttributes = {
      ...propsSafeToSpread,
      ...(resolvedActiveProps.value || {}),
      ...(resolvedInactiveProps.value || {}),
      href: href.value,
      ref,
      // Explicitly cast handlers to any to work around type issues
      onClick: composeEventHandlers<MouseEvent>([onClick, handleClick]) as any,
      onFocus: composeEventHandlers<FocusEvent>([onFocus, handleFocus]) as any,
      onMouseEnter: composeEventHandlers<MouseEvent>([onMouseEnter, handleEnter]) as any,
      onMouseOver: composeEventHandlers<MouseEvent>([onMouseOver, handleEnter]) as any,
      onMouseLeave: composeEventHandlers<MouseEvent>([onMouseLeave, handleLeave]) as any,
      onMouseOut: composeEventHandlers<MouseEvent>([onMouseOut, handleLeave]) as any,
      onTouchStart: composeEventHandlers<TouchEvent>([onTouchStart, handleTouchStart]) as any,
      disabled: !!disabled,
      target,
    }
    
    // Add props only if they have values
    if (resolvedStyle.value) {
      props.style = resolvedStyle.value
    }
    
    if (resolvedClassName.value) {
      props.class = resolvedClassName.value
    }
    
    if (disabled) {
      props.role = 'link'
      props['aria-disabled'] = true
    }
    
    if (isActive.value) {
      props['data-status'] = 'active'
      props['aria-current'] = 'page'
    }
    
    if (isTransitioning.value) {
      props['data-transitioning'] = 'transitioning'
    }
    
    return props
  })

  return result.value
}

// Type definitions
export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  HTMLAttributes

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
  HTMLAttributes & {
    [key: `data-${string}`]: unknown
    additionalProps?: number
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

// Resolve duplicate type name by using different names
interface LinkComponentPropsBase<TComp> {
  // Props specific to different component types
  [key: string]: any
  additionalProps?: number
}

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentPropsBase<TComp> &
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
  return ((props: any) => Vue.h(Link, { ...props, _asChild: Comp })) as any
}

const LinkImpl = Vue.defineComponent({
  name: 'Link',
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
    'disabled'
  ],
  setup(props, { attrs, slots }) {
    const allProps = Vue.computed(() => ({ ...props, ...attrs }))
    const linkProps = useLinkProps(allProps.value as any)
    
    const isActive = Vue.computed(() => linkProps['data-status'] === 'active')
    const isTransitioning = Vue.computed(() => linkProps['data-transitioning'] === 'transitioning')
    
    return () => {
      const Component = props._asChild || 'a'
      
      // Create the slot content or empty array if no default slot
      const slotContent = slots.default ? 
        slots.default({
          isActive: isActive.value,
          isTransitioning: isTransitioning.value
        }) : 
        []
      
      // Return the component with props and children
      return Vue.h(Component, linkProps, slotContent)
    }
  }
})

/**
 * Link component with proper TypeScript generics support
 */
export const Link = LinkImpl as unknown as {
  <
    TRouter extends AnyRouter = RegisteredRouter,
    TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
    TTo extends string | undefined = '.',
    TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
    TMaskTo extends string = '.',
  >(
    props: LinkComponentProps<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
  ): Vue.VNode
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
