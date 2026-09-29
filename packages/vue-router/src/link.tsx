import * as Vue from 'vue'
import {
  createLinkStore,
  getLinkLocation,
  getUrlScheme,
  hasKeys,
  invalidateLink,
  isDangerousProtocol,
  preloadWarning,
  readLinkSnapshot,
  readLinkState,
  refreshLink,
} from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'

import { useRouter } from './useRouter'
import { routeIdContext } from './matchContext'
import { useIntersectionObserver } from './utils'

import type {
  AnyRouter,
  Constrain,
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

const timeoutMap = new WeakMap<object, ReturnType<typeof setTimeout>>()

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

type VueStyleLinkEventHandlers = {
  onMouseenter?: EventHandler<MouseEvent>
  onMouseleave?: EventHandler<MouseEvent>
  onMouseover?: EventHandler<MouseEvent>
  onMouseout?: EventHandler<MouseEvent>
  onTouchstart?: EventHandler<TouchEvent>
}

type LinkEventHandlers = {
  onClick: EventHandler<PointerEvent>
  onBlur: EventHandler<FocusEvent>
  onFocus: EventHandler<FocusEvent>
  onMouseenter: EventHandler<MouseEvent>
  onMouseleave: EventHandler<MouseEvent>
  onMouseover: EventHandler<MouseEvent>
  onMouseout: EventHandler<MouseEvent>
  onTouchstart: EventHandler<TouchEvent>
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

type AnyLinkPropsOptions = UseLinkPropsOptions<any, any, any, any, any> & {
  _asChild?: unknown
}
type LinkEventOptions = AnyLinkPropsOptions & Partial<VueStyleLinkEventHandlers>

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): LinkHTMLAttributes {
  return useLinkPropsImpl(() => options as AnyLinkPropsOptions)
}

function useLinkPropsImpl(
  getOptions: () => AnyLinkPropsOptions,
  router: AnyRouter = useRouter(),
  getDestinationOptions = getOptions,
): LinkHTMLAttributes {
  let renderFetchedHref: string | undefined

  // Ensure router is defined before proceeding
  if (!router) {
    console.warn('useRouter must be used inside a <RouterProvider> component!')
    return {}
  }

  // During SSR we render exactly once and do not need reactivity.
  // Avoid store subscriptions, effects and observers on the server.
  if (isServer ?? router.isServer) {
    const options = getOptions()
    if (getUrlScheme(`${options.to}`)) {
      const props = getExternalLinkProps(options, router)
      return Vue.toRef(() => props) as unknown as LinkHTMLAttributes
    }

    const [href, isActive] = readLinkState(router, options as any)
    const { resolvedProps, resolvedClass, resolvedStyle } = resolveStyleProps(
      options,
      !!isActive,
    )
    const props = combineResultProps({
      href,
      options,
      isActive: !!isActive,
      resolvedProps,
      resolvedClass,
      resolvedStyle,
    }) as LinkHTMLAttributes
    // Getter refs preserve the hook shape without a reactive dependency graph.
    return Vue.toRef(() => props) as unknown as LinkHTMLAttributes
  }

  const ref = Vue.ref<Element | null>(null)
  const owner = Vue.inject(routeIdContext, undefined)
  const readSnapshot = Vue.shallowRef<
    () => readonly [
      href: string | undefined,
      isActive?: boolean,
      internalHref?: string,
    ]
  >(() => [undefined])
  const preparedSnapshot = Vue.computed(() => {
    const read = readSnapshot.value
    try {
      return read()
    } catch {
      // Keep the core reader as the failure value, without caching a second error.
      return read
    }
  })
  const snapshot = () => {
    const value = preparedSnapshot.value
    return typeof value === 'function' ? value() : value
  }
  const store = createLinkStore(router)
  let read: (() => unknown) | undefined
  let runner: Vue.ReactiveEffectRunner | undefined
  const evaluate = <T,>(callback: () => T): T => {
    // Each core build replaces the reactive dependencies of user callbacks.
    // Start with an empty read so a failed derivation does not stop the effect.
    runner ??= Vue.effect(() => read?.(), {
      scheduler: () => invalidateLink(store),
    })
    read = callback
    try {
      return runner() as T
    } finally {
      read = undefined
    }
  }
  const update = () => {
    // Evaluate in the consuming computation, where Vue can capture errors.
    readSnapshot.value = () => {
      const state = readLinkSnapshot(store[1 /* current */]!)
      return [state[0], state[1], getLinkLocation(store)?.href]
    }
  }
  Vue.watchEffect(() => {
    const options = getDestinationOptions()
    refreshLink(
      [
        store,
        {
          to: options.to,
          href: options.href,
          from: options.from,
          _fromLocation: options._fromLocation,
          params: options.params,
          search: options.search,
          hash: options.hash,
          state: options.state,
          mask: options.mask,
          unsafeRelative: options.unsafeRelative,
          disabled: options.disabled,
          activeOptions: options.activeOptions && { ...options.activeOptions },
        } as any,
        owner,
        undefined,
        evaluate,
        undefined,
        undefined,
        undefined,
      ],
      true,
    )
    update()
  })

  const unsubscribe = store[3 /* subscribe */](update)
  Vue.onScopeDispose(() => {
    unsubscribe()
    if (runner) {
      Vue.stop(runner)
    }
  })

  const isExternal = () => !!getUrlScheme(`${getOptions().to}`)
  const href = () => snapshot()[0]
  const isActive = () => !!snapshot()[1]

  const preload = Vue.computed(() => {
    const options = getOptions()
    const currentHref = href()
    if (
      isExternal() ||
      (!options.disabled &&
        (currentHref === undefined || !!getUrlScheme(currentHref))) ||
      options.reloadDocument ||
      options.disabled
    ) {
      return false
    }
    return options.preload ?? router.options.defaultPreload
  })

  const preloadDelay = Vue.computed(
    () => getOptions().preloadDelay ?? router.options.defaultPreloadDelay ?? 0,
  )

  const doPreload = () => {
    const options = getOptions()
    return router
      .preloadRoute(options as Parameters<typeof router.preloadRoute>[0])
      .catch((err: any) => {
        console.warn(err)
        console.warn(preloadWarning)
      })
  }

  let pendingPreload: 'intent' | 'viewport' | undefined

  const enqueuePreload = (
    e?: MouseEvent | FocusEvent | IntersectionObserverEntry,
  ) => {
    if (!e) {
      clearTimeout(timeoutMap.get(ref))
      timeoutMap.delete(ref)
      pendingPreload = undefined
      return
    }

    const isIntersecting = (e as IntersectionObserverEntry).isIntersecting
    const preloadMode = isIntersecting === undefined ? 'intent' : 'viewport'
    if (preload.value !== preloadMode || isIntersecting === false) {
      if (isIntersecting === false && pendingPreload === 'viewport') {
        clearTimeout(timeoutMap.get(ref))
        timeoutMap.delete(ref)
        pendingPreload = undefined
      }
      return
    }

    if (!preloadDelay.value) {
      doPreload()
      return
    }

    if (!timeoutMap.has(ref)) {
      const scheduledHref = snapshot()[2]
      pendingPreload = preloadMode
      timeoutMap.set(
        ref,
        setTimeout(() => {
          timeoutMap.delete(ref)
          pendingPreload = undefined
          if (
            preload.value === preloadMode &&
            snapshot()[2] === scheduledHref
          ) {
            doPreload()
          }
        }, preloadDelay.value),
      )
    }
  }

  useIntersectionObserver(
    ref,
    enqueuePreload,
    () => preload.value !== 'viewport',
    // Intent preloading still needs timer cleanup without an observer.
    () => !!preload.value,
  )

  Vue.watchEffect(() => {
    if (preload.value !== 'render') {
      return
    }

    const nextHref = snapshot()[2]
    if (nextHref && renderFetchedHref !== nextHref) {
      renderFetchedHref = nextHref
      doPreload()
    }
  })

  // The click handler
  const handleClick = (e: PointerEvent): void => {
    const options = getOptions()
    const currentHref = href()
    if (
      isExternal() ||
      (!options.disabled &&
        (currentHref === undefined || !!getUrlScheme(currentHref)))
    ) {
      return
    }

    // Check actual element's target attribute as fallback
    const elementTarget = (
      e.currentTarget as HTMLAnchorElement | SVGAElement
    )?.getAttribute('target')
    const effectiveTarget =
      options.target !== undefined ? options.target : elementTarget

    if (
      !options.disabled &&
      !(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) &&
      !e.defaultPrevented &&
      (!effectiveTarget || effectiveTarget === '_self') &&
      e.button === 0
    ) {
      // Don't prevent default or handle navigation if reloadDocument is true
      if (options.reloadDocument) {
        return
      }

      e.preventDefault()

      // All is well? Navigate!
      router.navigate({
        ...options,
        replace: options.replace,
        resetScroll: options.resetScroll,
        hashScrollIntoView: options.hashScrollIntoView,
        startTransition: options.startTransition,
        viewTransition: options.viewTransition,
        ignoreBlocker: options.ignoreBlocker,
      })
    }
  }

  const handleTouchStart = () => {
    if (preload.value === 'intent') {
      doPreload()
    }
  }

  const handleLeave = () => {
    if (pendingPreload === 'intent') {
      clearTimeout(timeoutMap.get(ref))
      timeoutMap.delete(ref)
      pendingPreload = undefined
    }
  }

  function composeEventHandlers<T extends Event>(
    getUserHandler: () => EventHandler<T> | undefined,
    handler: EventHandler<T>,
  ): (e: T) => void {
    return (event: T) => {
      getUserHandler()?.(event)
      handler(event)
    }
  }

  // Get the active and inactive props
  const resolvedStyleProps = Vue.computed(() => {
    const options = getOptions()
    return resolveStyleProps(options, isActive())
  })

  // Create static event handlers that don't change between renders
  const staticEventHandlers: LinkEventHandlers = {
    onClick: composeEventHandlers(() => getOptions().onClick, handleClick),
    onBlur: composeEventHandlers(() => getOptions().onBlur, handleLeave),
    onFocus: composeEventHandlers(() => getOptions().onFocus, enqueuePreload),
    onMouseenter: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseenter,
      enqueuePreload,
    ),
    onMouseover: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseover,
      enqueuePreload,
    ),
    onMouseleave: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseleave,
      handleLeave,
    ),
    onMouseout: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onMouseout,
      handleLeave,
    ),
    onTouchstart: composeEventHandlers(
      () => getLinkEventHandlers(getOptions() as LinkEventOptions).onTouchstart,
      handleTouchStart,
    ),
  }

  // Compute all props synchronously to avoid hydration mismatches
  // Using Vue.computed ensures props are calculated at render time, not after
  const computedProps = Vue.computed<LinkHTMLAttributes>(() => {
    const options = getOptions()
    if (isExternal()) {
      return getExternalLinkProps(options, router, ref, staticEventHandlers)
    }

    const { resolvedProps, resolvedClass, resolvedStyle } =
      resolvedStyleProps.value
    return combineResultProps({
      href: href(),
      options,
      ref,
      staticEventHandlers,
      isActive: isActive(),
      resolvedProps,
      resolvedClass,
      resolvedStyle,
    })
  })

  // Check the core read before cached prop computations. Vue caches a failed
  // computed's empty value; reading here preserves the original boundary error.
  return Vue.toRef(() => {
    snapshot()
    return computedProps.value
  }) as unknown as LinkHTMLAttributes
}

function resolveStyleProps(options: AnyLinkPropsOptions, isActive: boolean) {
  const props =
    (isActive ? options.activeProps : options.inactiveProps) ||
    (isActive ? STATIC_ACTIVE_PROPS : EMPTY_OBJECT)
  const resolvedProps: StyledProps =
    (typeof props === 'function' ? props() : props) || EMPTY_OBJECT
  const baseClass = options.class
  const stateClass = resolvedProps.class
  const resolvedClass = baseClass
    ? stateClass
      ? [baseClass, stateClass]
      : baseClass
    : stateClass
      ? stateClass
      : undefined

  const baseStyle = options.style
  const stateStyle = resolvedProps.style
  let resolvedStyle: Record<string, string | number> | undefined
  if (baseStyle || stateStyle) {
    // Keep a snapshot of reactive styles rather than returning their proxy.
    const style: Record<string, string | number> = {}
    Object.assign(style, baseStyle, stateStyle)
    if (hasKeys(style)) {
      resolvedStyle = style
    }
  }
  return {
    resolvedProps,
    resolvedClass,
    resolvedStyle,
  }
}

const STATIC_ACTIVE_PROPS = { class: 'active' }
const EMPTY_OBJECT = {}

function combineResultProps({
  href,
  options,
  isActive,
  resolvedProps,
  resolvedClass,
  resolvedStyle,
  ref,
  staticEventHandlers,
}: {
  initial?: LinkHTMLAttributes
  href: string | undefined
  options: AnyLinkPropsOptions
  isActive: boolean
  resolvedProps: StyledProps
  resolvedClass?: StyledProps['class']
  resolvedStyle?: Record<string, string | number>
  ref?: Vue.VNodeRef | undefined
  staticEventHandlers?: LinkEventHandlers
}) {
  const disabled = options.disabled || href === undefined
  const result: Record<string, unknown> = {
    ...getPropsSafeToSpread(options),
    ref,
    ...staticEventHandlers,
    disabled: options._asChild ? disabled : undefined,
    target: options.target,
  }

  if (resolvedStyle) {
    result.style = resolvedStyle
  }

  if (resolvedClass) {
    result.class = resolvedClass
  }

  if (disabled) {
    result.role = 'link'
    result['aria-disabled'] = true
  }

  if (isActive) {
    result['data-status'] = 'active'
    result['aria-current'] = 'page'
  }

  for (const key of Object.keys(resolvedProps)) {
    if (key !== 'class' && key !== 'style') {
      result[key] = resolvedProps[key]
    }
  }

  result.href = href
  return result
}

function getExternalLinkProps(
  options: AnyLinkPropsOptions,
  router: AnyRouter,
  ref?: Vue.Ref<Element | null>,
  staticEventHandlers?: LinkEventHandlers,
): LinkHTMLAttributes {
  const dangerous = isDangerousProtocol(
    options.to as string,
    router.protocolAllowlist,
  )
  const disabled = options.disabled || dangerous
  if (process.env.NODE_ENV !== 'production' && dangerous) {
    console.warn(`Blocked Link with dangerous protocol: ${options.to}`)
  }

  const eventHandlers = getLinkEventHandlers(options as LinkEventOptions)
  const result: Record<string, unknown> = {
    ...getPropsSafeToSpread(options),
    ref,
    href: disabled ? undefined : options.to,
    target: options.target,
    disabled: options._asChild ? disabled : undefined,
    style: options.style,
    class: options.class,
    onClick: staticEventHandlers?.onClick ?? options.onClick,
    onBlur: staticEventHandlers?.onBlur ?? options.onBlur,
    onFocus: staticEventHandlers?.onFocus ?? options.onFocus,
    onMouseenter:
      staticEventHandlers?.onMouseenter ?? eventHandlers.onMouseenter,
    onMouseleave:
      staticEventHandlers?.onMouseleave ?? eventHandlers.onMouseleave,
    onMouseover: staticEventHandlers?.onMouseover ?? eventHandlers.onMouseover,
    onMouseout: staticEventHandlers?.onMouseout ?? eventHandlers.onMouseout,
    onTouchstart:
      staticEventHandlers?.onTouchstart ?? eventHandlers.onTouchstart,
  }

  if (disabled) {
    result.role = 'link'
    result['aria-disabled'] = true
  }

  for (const key of Object.keys(result)) {
    if (result[key] === undefined) {
      delete result[key]
    }
  }

  return result as LinkHTMLAttributes
}

function getLinkEventHandlers(
  options: LinkEventOptions,
): VueStyleLinkEventHandlers {
  return {
    onMouseenter: options.onMouseEnter ?? options.onMouseenter,
    onMouseleave: options.onMouseLeave ?? options.onMouseleave,
    onMouseover: options.onMouseOver ?? options.onMouseover,
    onMouseout: options.onMouseOut ?? options.onMouseout,
    onTouchstart: options.onTouchStart ?? options.onTouchstart,
  }
}

const getPropsSafeToSpread = (options: AnyLinkPropsOptions) => {
  const {
    activeProps: _activeProps,
    inactiveProps: _inactiveProps,
    activeOptions: _activeOptions,
    to: _to,
    preload: _preload,
    preloadDelay: _preloadDelay,
    preloadIntentProximity: _preloadIntentProximity,
    hashScrollIntoView: _hashScrollIntoView,
    replace: _replace,
    startTransition: _startTransition,
    resetScroll: _resetScroll,
    viewTransition: _viewTransition,
    children: _children,
    target: _target,
    disabled: _disabled,
    style: _style,
    class: _class,
    onClick: _onClick,
    onBlur: _onBlur,
    onFocus: _onFocus,
    onMouseEnter: _onMouseEnter,
    onMouseenter: _onMouseenter,
    onMouseLeave: _onMouseLeave,
    onMouseleave: _onMouseleave,
    onMouseOver: _onMouseOver,
    onMouseover: _onMouseover,
    onMouseOut: _onMouseOut,
    onMouseout: _onMouseout,
    onTouchStart: _onTouchStart,
    onTouchstart: _onTouchstart,
    ignoreBlocker: _ignoreBlocker,
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    reloadDocument: _reloadDocument,
    unsafeRelative: _unsafeRelative,
    _asChild: __asChild,
    from: _from,
    additionalProps: _additionalProps,
    ...propsSafeToSpread
  } = options as AnyLinkPropsOptions & {
    additionalProps?: unknown
    children?: unknown
    _asChild?: unknown
  }

  return propsSafeToSpread
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
  children?: Vue.VNodeChild | ((state: { isActive: boolean }) => Vue.VNodeChild)
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
      return () => Vue.h(LinkImpl, { ...attrs, _asChild: Comp }, slots)
    },
  }) as any
}

const LinkImpl = Vue.defineComponent({
  name: 'Link',
  inheritAttrs: false,
  props: [
    '_asChild',
    'to',
    'href',
    '_fromLocation',
    'unsafeRelative',
    'preload',
    'preloadDelay',
    'preloadIntentProximity',
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
    const router = useRouter()
    let getOptions: () => AnyLinkPropsOptions
    if (isServer ?? router.isServer) {
      getOptions = () => ({ ...props, ...attrs }) as AnyLinkPropsOptions
    } else {
      const attrsSnapshot = Vue.shallowRef({ ...attrs })
      Vue.onBeforeUpdate(() => {
        const keys = Object.keys(attrs)
        const previous = attrsSnapshot.value
        if (
          keys.length !== Object.keys(previous).length ||
          keys.some((key) => !Object.is(attrs[key], previous[key]))
        ) {
          attrsSnapshot.value = { ...attrs }
        }
      })
      const allProps = Vue.computed(() => ({
        ...props,
        ...attrsSnapshot.value,
      }))
      getOptions = () => allProps.value as AnyLinkPropsOptions
    }
    const linkPropsSource = useLinkPropsImpl(
      getOptions,
      router,
      () => props as AnyLinkPropsOptions,
    ) as LinkHTMLAttributes | Vue.ComputedRef<LinkHTMLAttributes>

    return () => {
      const Component = props._asChild || 'a'

      const linkProps = Vue.unref(linkPropsSource)

      const isActive = linkProps['data-status'] === 'active'

      // Create the slot content or empty array if no default slot
      const slotContent = slots.default ? slots.default({ isActive }) : []

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

      // Vue normalizes class bindings in place; preserve the cached bindings.
      return Vue.h(Component, { ...linkProps }, slotContent)
    }
  },
})

/**
 * Link component with proper TypeScript generics support
 */
export const Link = LinkImpl as unknown as Vue.Component<unknown> &
  Vue.Component<CreateLinkProps> &
  LinkComponent<'a'>

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
