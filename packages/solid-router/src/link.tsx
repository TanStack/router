import * as Solid from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { mergeRefs } from '@solid-primitives/refs'
import {
  deepEqual,
  functionalUpdate,
  exactPathTest,
  removeTrailingSlash,
  preloadWarning,
} from '@tanstack/router-core'
import { composeEventHandlers, useIntersectionObserver } from './utils'
import { useMatch } from './useMatch'
import { useRouter } from './useRouter'
import { useRouterState } from './useRouterState'
import type {
  IsRequiredParams,
  LinkCurrentTargetElement,
  LinkOptionsProps,
  RemoveLeadingSlashes,
  RemoveTrailingSlashes,
  ResolveRelativePath,
} from '@tanstack/router-core'
import type {
  AllParams,
  CatchAllPaths,
  FullSearchSchema,
  FullSearchSchemaInput,
  RouteByPath,
  RouteByToPath,
  RoutePaths,
  RouteToPath,
  TrailingSlashOptionByRouter,
} from './routeInfo'
import type { AnyRouter, RegisteredRouter } from './router'
import type {
  Constrain,
  ConstrainLiteral,
  Expand,
  MakeDifferenceOptional,
  NoInfer,
  NonNullableUpdater,
  PickRequired,
  Updater,
  WithoutEmpty,
} from '@tanstack/router-core'
import type { HistoryState } from '@tanstack/history'
import type { ParsedLocation } from '@tanstack/router-core'
import type { ViewTransitionOptions } from '@tanstack/router-core'
import type { CurrentPath, ParentPath } from '@tanstack/router-core'

export type FindDescendantPaths<
  TRouter extends AnyRouter,
  TPrefix extends string,
> = `${TPrefix}${string}` & RouteToPath<TRouter>

export type SearchPaths<
  TRouter extends AnyRouter,
  TPrefix extends string,
  TPaths = FindDescendantPaths<TRouter, TPrefix>,
> = TPaths extends `${TPrefix}${infer TRest}` ? TRest : never

export type SearchRelativePathAutoComplete<
  TRouter extends AnyRouter,
  TTo extends string,
  TSearchPath extends string,
> = `${TTo}${SearchPaths<TRouter, TSearchPath>}`

export type RelativeToParentPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = RemoveTrailingSlashes<
    ResolveRelativePath<TFrom, TTo>
  >,
> =
  | SearchRelativePathAutoComplete<TRouter, TTo, TResolvedPath>
  | (TResolvedPath extends ''
      ? never
      : `${TTo}/${ParentPath<TrailingSlashOptionByRouter<TRouter>>}`)

export type RelativeToCurrentPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = RemoveTrailingSlashes<
    ResolveRelativePath<TFrom, TTo>
  >,
> =
  | SearchRelativePathAutoComplete<TRouter, TTo, TResolvedPath>
  | CurrentPath<TrailingSlashOptionByRouter<TRouter>>

export type AbsolutePathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
> =
  | (string extends TFrom
      ? CurrentPath<TrailingSlashOptionByRouter<TRouter>>
      : TFrom extends `/`
        ? never
        : FindDescendantPaths<TRouter, TFrom> extends never
          ? never
          : CurrentPath<TrailingSlashOptionByRouter<TRouter>>)
  | (string extends TFrom
      ? ParentPath<TrailingSlashOptionByRouter<TRouter>>
      : TFrom extends `/`
        ? never
        : ParentPath<TrailingSlashOptionByRouter<TRouter>>)
  | RouteToPath<TRouter>
  | (TFrom extends '/'
      ? never
      : string extends TFrom
        ? never
        : RemoveLeadingSlashes<SearchPaths<TRouter, TFrom>>)

export type RelativeToPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
> = string extends TTo
  ? string
  : string extends TFrom
    ? AbsolutePathAutoComplete<TRouter, TFrom>
    : TTo & `..${string}` extends never
      ? TTo & `.${string}` extends never
        ? AbsolutePathAutoComplete<TRouter, TFrom>
        : RelativeToCurrentPathAutoComplete<
            TRouter,
            TFrom,
            RemoveTrailingSlashes<TTo>
          >
      : RelativeToParentPathAutoComplete<
          TRouter,
          TFrom,
          RemoveTrailingSlashes<TTo>
        >

export type NavigateOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & NavigateOptionProps

export interface NavigateOptionProps {
  // if set to `true`, the router will scroll the element with an id matching the hash into view with default ScrollIntoViewOptions.
  // if set to `false`, the router will not scroll the element with an id matching the hash into view.
  // if set to `ScrollIntoViewOptions`, the router will scroll the element with an id matching the hash into view with the provided options.
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
  resetScroll?: boolean
  /** @deprecated All navigations now use startTransition under the hood */
  startTransition?: boolean
  // if set to `true`, the router will wrap the resulting navigation in a document.startViewTransition() call.
  // if set to `ViewTransitionOptions`, the router will pass the `types` field to document.startViewTransition({update: fn, types: viewTransition.types}) call
  viewTransition?: boolean | ViewTransitionOptions
  ignoreBlocker?: boolean
  reloadDocument?: boolean
  href?: string
}

export type ToOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = ToSubOptions<TRouter, TFrom, TTo> & MaskOptions<TRouter, TMaskFrom, TMaskTo>

export interface MaskOptions<
  in out TRouter extends AnyRouter,
  in out TMaskFrom extends string,
  in out TMaskTo extends string,
> {
  _fromLocation?: ParsedLocation
  mask?: ToMaskOptions<TRouter, TMaskFrom, TMaskTo>
}

export type ToMaskOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TMaskFrom extends string = string,
  TMaskTo extends string = '.',
> = ToSubOptions<TRouter, TMaskFrom, TMaskTo> & {
  unmaskOnReload?: boolean
}

export type ToSubOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  SearchParamOptions<TRouter, TFrom, TTo> &
  PathParamOptions<TRouter, TFrom, TTo>

export interface ToSubOptionsProps<
  in out TRouter extends AnyRouter = RegisteredRouter,
  in out TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  in out TTo extends string | undefined = '.',
> {
  to?: ToPathOption<TRouter, TFrom, TTo> & {}
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<HistoryState>
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: FromPathOption<TRouter, TFrom> & {}
}

export type ParamsReducerFn<
  in out TRouter extends AnyRouter,
  in out TParamVariant extends ParamVariant,
  in out TFrom,
  in out TTo,
> = (
  current: Expand<ResolveFromParams<TRouter, TParamVariant, TFrom>>,
) => Expand<ResolveRelativeToParams<TRouter, TParamVariant, TFrom, TTo>>

type ParamsReducer<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  | Expand<ResolveRelativeToParams<TRouter, TParamVariant, TFrom, TTo>>
  | (ParamsReducerFn<TRouter, TParamVariant, TFrom, TTo> & {})

type ParamVariant = 'PATH' | 'SEARCH'

export type ResolveRoute<
  TRouter extends AnyRouter,
  TFrom,
  TTo,
  TPath = ResolveRelativePath<TFrom, TTo>,
> = TPath extends string
  ? TFrom extends TPath
    ? RouteByPath<TRouter['routeTree'], TPath>
    : RouteByToPath<TRouter, TPath>
  : never

type ResolveFromParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchema'

type ResolveFromAllParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'PATH'
  ? AllParams<TRouter['routeTree']>
  : FullSearchSchema<TRouter['routeTree']>

type ResolveFromParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
> = string extends TFrom
  ? ResolveFromAllParams<TRouter, TParamVariant>
  : RouteByPath<
      TRouter['routeTree'],
      TFrom
    >['types'][ResolveFromParamType<TParamVariant>]

type ResolveToParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchemaInput'

type ResolveAllToParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'PATH'
  ? AllParams<TRouter['routeTree']>
  : FullSearchSchemaInput<TRouter['routeTree']>

export type ResolveToParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  ResolveRelativePath<TFrom, TTo> extends infer TPath
    ? undefined extends TPath
      ? never
      : string extends TPath
        ? ResolveAllToParams<TRouter, TParamVariant>
        : TPath extends CatchAllPaths<TrailingSlashOptionByRouter<TRouter>>
          ? ResolveAllToParams<TRouter, TParamVariant>
          : ResolveRoute<
              TRouter,
              TFrom,
              TTo
            >['types'][ResolveToParamType<TParamVariant>]
    : never

type ResolveRelativeToParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
  TToParams = ResolveToParams<TRouter, TParamVariant, TFrom, TTo>,
> = TParamVariant extends 'SEARCH'
  ? TToParams
  : string extends TFrom
    ? TToParams
    : MakeDifferenceOptional<
        ResolveFromParams<TRouter, TParamVariant, TFrom>,
        TToParams
      >

export interface MakeOptionalSearchParams<
  in out TRouter extends AnyRouter,
  in out TFrom,
  in out TTo,
> {
  search?: true | (ParamsReducer<TRouter, 'SEARCH', TFrom, TTo> & {})
}

export interface MakeOptionalPathParams<
  in out TRouter extends AnyRouter,
  in out TFrom,
  in out TTo,
> {
  params?: true | (ParamsReducer<TRouter, 'PATH', TFrom, TTo> & {})
}

type MakeRequiredParamsReducer<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  | (string extends TFrom
      ? never
      : ResolveFromParams<TRouter, TParamVariant, TFrom> extends WithoutEmpty<
            PickRequired<
              ResolveRelativeToParams<TRouter, TParamVariant, TFrom, TTo>
            >
          >
        ? true
        : never)
  | (ParamsReducer<TRouter, TParamVariant, TFrom, TTo> & {})

export interface MakeRequiredPathParams<
  in out TRouter extends AnyRouter,
  in out TFrom,
  in out TTo,
> {
  params: MakeRequiredParamsReducer<TRouter, 'PATH', TFrom, TTo> & {}
}

export interface MakeRequiredSearchParams<
  in out TRouter extends AnyRouter,
  in out TFrom,
  in out TTo,
> {
  search: MakeRequiredParamsReducer<TRouter, 'SEARCH', TFrom, TTo> & {}
}

export type IsRequired<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  ResolveRelativePath<TFrom, TTo> extends infer TPath
    ? undefined extends TPath
      ? never
      : TPath extends CatchAllPaths<TrailingSlashOptionByRouter<TRouter>>
        ? never
        : IsRequiredParams<
            ResolveRelativeToParams<TRouter, TParamVariant, TFrom, TTo>
          >
    : never

export type SearchParamOptions<TRouter extends AnyRouter, TFrom, TTo> =
  IsRequired<TRouter, 'SEARCH', TFrom, TTo> extends never
    ? MakeOptionalSearchParams<TRouter, TFrom, TTo>
    : MakeRequiredSearchParams<TRouter, TFrom, TTo>

export type PathParamOptions<TRouter extends AnyRouter, TFrom, TTo> =
  IsRequired<TRouter, 'PATH', TFrom, TTo> extends never
    ? MakeOptionalPathParams<TRouter, TFrom, TTo>
    : MakeRequiredPathParams<TRouter, TFrom, TTo>

export type ToPathOption<
  TRouter extends AnyRouter = AnyRouter,
  TFrom extends string = string,
  TTo extends string | undefined = string,
> = ConstrainLiteral<
  TTo,
  RelativeToPathAutoComplete<
    TRouter,
    NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
    NoInfer<TTo> & string
  >
>

export type FromPathOption<TRouter extends AnyRouter, TFrom> = ConstrainLiteral<
  TFrom,
  RoutePaths<TRouter['routeTree']>
>

export type LinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & LinkOptionsProps

// type Test1 = ResolveRelativePath<'/', '/posts'>
// //   ^?
// type Test4 = ResolveRelativePath<'/posts/1/comments', '../..'>
// //   ^?
// type Test5 = ResolveRelativePath<'/posts/1/comments', '../../..'>
// //   ^?
// type Test6 = ResolveRelativePath<'/posts/1/comments', './1'>
// //   ^?
// type Test7 = ResolveRelativePath<'/posts/1/comments', './1/2'>
// //   ^?
// type Test8 = ResolveRelativePath<'/posts/1/comments', '../edit'>
// //   ^?
// type Test9 = ResolveRelativePath<'/posts/1/comments', '1'>
// //   ^?
// type Test10 = ResolveRelativePath<'/posts/1/comments', './1'>
// //   ^?
// type Test11 = ResolveRelativePath<'/posts/1/comments', './1/2'>
// //   ^?

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
  const [isTransitioning, setIsTransitioning] = Solid.createSignal(false)
  let hasRenderFetched = false

  const [local, rest] = Solid.splitProps(
    Solid.mergeProps(
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
  ])

  // If this link simply reloads the current route,
  // make sure it has a new key so it will trigger a data refresh

  // If this `to` is a valid external URL, return
  // null for LinkUtils

  const type: Solid.Accessor<'internal' | 'external'> = () => {
    try {
      new URL(`${local.to}`)
      return 'external'
    } catch {}
    return 'internal'
  }

  // subscribe to search params to re-build location if it changes
  const currentSearch = useRouterState({
    select: (s) => s.location.search,
  })

  // In the rare event that the user bypasses type-safety and doesn't supply a `from`
  // we'll use the current route as the `from` location so relative routing works as expected
  const parentRouteId = useMatch({ strict: false, select: (s) => s.pathname })

  // Use it as the default `from` location
  options = {
    get from() {
      return parentRouteId()
    },
    ...options,
  }

  const next = Solid.createMemo(() => {
    currentSearch()
    return Solid.untrack(() => router.buildLocation(options as any))
  })

  const preload = Solid.createMemo(() => {
    if (options.reloadDocument) {
      return false
    }
    return local.preload ?? router.options.defaultPreload
  })
  const preloadDelay = () =>
    local.preloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      if (local.activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next().pathname,
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
          next().pathname,
          router.basepath,
        ).split('/')

        const pathIsFuzzyEqual = nextPathSplit.every(
          (d, i) => d === currentPathSplit[i],
        )
        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (local.activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next().search, {
          partial: !local.activeOptions?.exact,
          ignoreUndefined: !local.activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (local.activeOptions?.includeHash) {
        return s.location.hash === next().hash
      }
      return true
    },
  })

  const doPreload = () =>
    router.preloadRoute(options as any).catch((err: any) => {
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

  const [ref, setRef] = Solid.createSignal<Element | null>(null)

  useIntersectionObserver(
    ref,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    { disabled: !!local.disabled || !(local.preload === 'viewport') },
  )

  Solid.createEffect(() => {
    if (hasRenderFetched) {
      return
    }
    if (!local.disabled && preload() === 'render') {
      doPreload()
      hasRenderFetched = true
    }
  })

  if (type() === 'external') {
    return Solid.mergeProps(
      propsSafeToSpread,
      {
        ref,
        get type() {
          return type()
        },
        get href() {
          return local.to
        },
      },
      Solid.splitProps(local, [
        'children',
        'target',
        'disabled',
        'style',
        'class',
        'onClick',
        'onFocus',
        'onMouseEnter',
        'onMouseLeave',
        'onTouchStart',
      ])[0],
    ) as any
  }

  // The click handler
  const handleClick = (e: MouseEvent) => {
    if (
      !local.disabled &&
      !isCtrlEvent(e) &&
      !e.defaultPrevented &&
      (!local.target || local.target === '_self') &&
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
        ...options,
        replace: local.replace,
        resetScroll: local.resetScroll,
        hashScrollIntoView: local.hashScrollIntoView,
        startTransition: local.startTransition,
        viewTransition: local.viewTransition,
        ignoreBlocker: local.ignoreBlocker,
      } as any)
    }
  }

  // The click handler
  const handleFocus = (_: MouseEvent) => {
    if (local.disabled) return
    if (preload()) {
      doPreload()
    }
  }

  const handleTouchStart = handleFocus

  const handleEnter = (e: MouseEvent) => {
    if (local.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (preload()) {
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
    if (local.disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (eventTarget.preloadTimeout) {
      clearTimeout(eventTarget.preloadTimeout)
      eventTarget.preloadTimeout = null
    }
  }

  // Get the active props
  const resolvedActiveProps: () => Omit<Solid.ComponentProps<'a'>, 'style'> & {
    style?: Solid.JSX.CSSProperties
  } = () =>
    isActive() ? (functionalUpdate(local.activeProps as any, {}) ?? {}) : {}

  // Get the inactive props
  const resolvedInactiveProps: () => Omit<
    Solid.ComponentProps<'a'>,
    'style'
  > & { style?: Solid.JSX.CSSProperties } = () =>
    isActive() ? {} : functionalUpdate(local.inactiveProps, {})

  const resolvedClassName = () =>
    [local.class, resolvedActiveProps().class, resolvedInactiveProps().class]
      .filter(Boolean)
      .join(' ')

  const resolvedStyle = () => ({
    ...local.style,
    ...resolvedActiveProps().style,
    ...resolvedInactiveProps().style,
  })

  return Solid.mergeProps(
    propsSafeToSpread,
    resolvedActiveProps,
    resolvedInactiveProps,
    () => {
      const maskedLocation = next().maskedLocation
      return {
        href: local.disabled
          ? undefined
          : maskedLocation
            ? router.history.createHref(maskedLocation.href)
            : router.history.createHref(next().href),
        ref: mergeRefs(setRef, options.ref),
        onClick: composeEventHandlers([local.onClick, handleClick]),
        onFocus: composeEventHandlers([local.onFocus, handleFocus]),
        onMouseEnter: composeEventHandlers([local.onMouseEnter, handleEnter]),
        onMouseLeave: composeEventHandlers([local.onMouseLeave, handleLeave]),
        onTouchStart: composeEventHandlers([
          local.onTouchStart,
          handleTouchStart,
        ]),
        disabled: !!local.disabled,
        target: local.target,
        ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
        ...(resolvedClassName() && { class: resolvedClassName() }),
        ...(local.disabled && {
          role: 'link',
          'aria-disabled': true,
        }),
        ...(isActive() && { 'data-status': 'active', 'aria-current': 'page' }),
        ...(isTransitioning() && { 'data-transitioning': 'transitioning' }),
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
    | Solid.JSXElement
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => Solid.JSXElement)
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

export type LinkComponent<TComp> = <
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => Solid.JSXElement

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => Solid.JSXElement>,
): LinkComponent<TComp> {
  return (props) => <Link {...(props as any)} _asChild={Comp} />
}

export const Link: LinkComponent<'a'> = (props: any) => {
  const [local, rest] = Solid.splitProps(props, ['_asChild'])

  const [_, linkProps] = Solid.splitProps(useLinkProps(rest), [
    'type',
    'children',
  ])

  const children = () =>
    typeof rest.children === 'function'
      ? rest.children({
          get isActive() {
            return (linkProps as any)['data-status'] === 'active'
          },
        })
      : rest.children

  if (typeof local._asChild === 'undefined') {
    // the Retlocal.urnType of useLinkProps returns the correct type for a <a> element, not a general component that has a disabled prop
    // @ts-expect-error
    delete linkProps.disabled
  }

  return (
    <Dynamic component={local._asChild ? local._asChild : 'a'} {...linkProps}>
      {children}
    </Dynamic>
  )
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type LinkOptionsFn<TComp> = <
  const TProps,
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  options: Constrain<
    TProps,
    LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>
  >,
) => TProps

export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}
