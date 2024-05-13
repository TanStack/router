import * as React from 'react'
import { flushSync } from 'react-dom'
import { useMatch } from './Matches'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { deepEqual, exactPathTest, functionalUpdate } from './utils'
import type { AnyRouter, ParsedLocation } from '.'
import type { HistoryState } from '@tanstack/history'
import type { AnyRoute, RootSearchSchema } from './route'
import type {
  CatchAllPaths,
  ParseRoute,
  ParseRouteWithoutBranches,
  RouteByPath,
  RouteByToPath,
  RoutePaths,
  RoutePathsAutoComplete,
  RouteToPath,
} from './routeInfo'
import type { RegisteredRouter } from './router'
import type {
  Expand,
  MakeDifferenceOptional,
  NoInfer,
  NonNullableUpdater,
  PickRequired,
  Updater,
  WithoutEmpty,
} from './utils'

export type CleanPath<T extends string> = T extends `${infer L}//${infer R}`
  ? CleanPath<`${CleanPath<L>}/${CleanPath<R>}`>
  : T extends `${infer L}//`
    ? `${CleanPath<L>}/`
    : T extends `//${infer L}`
      ? `/${CleanPath<L>}`
      : T

export type Split<TValue, TIncludeTrailingSlash = true> = TValue extends unknown
  ? string extends TValue
    ? Array<string>
    : TValue extends string
      ? CleanPath<TValue> extends ''
        ? []
        : TIncludeTrailingSlash extends true
          ? CleanPath<TValue> extends `${infer T}/`
            ? [...Split<T>, '/']
            : CleanPath<TValue> extends `/${infer U}`
              ? Split<U>
              : CleanPath<TValue> extends `${infer T}/${infer U}`
                ? [...Split<T>, ...Split<U>]
                : [TValue]
          : CleanPath<TValue> extends `${infer T}/${infer U}`
            ? [...Split<T>, ...Split<U>]
            : TValue extends string
              ? [TValue]
              : never
      : never
  : never

export type ParsePathParams<
  T extends string,
  TAcc = never,
> = T extends `${string}$${infer TPossiblyParam}`
  ? TPossiblyParam extends `${infer TParam}/${infer TRest}`
    ? ParsePathParams<TRest, TParam extends '' ? '_splat' : TParam | TAcc>
    : TPossiblyParam extends ''
      ? '_splat'
      : TPossiblyParam | TAcc
  : TAcc

export type Join<T, TDelimiter extends string = '/'> = T extends []
  ? ''
  : T extends [infer L extends string]
    ? L
    : T extends [
          infer L extends string,
          ...infer Tail extends [...Array<string>],
        ]
      ? CleanPath<`${L}${TDelimiter}${Join<Tail>}`>
      : never

export type Last<T extends Array<any>> = T extends [...infer _, infer L]
  ? L
  : never

export type RemoveTrailingSlashes<T> = T extends `${infer R}/` ? R : T

export type RemoveLeadingSlashes<T> = T extends `/${infer R}` ? R : T

export type ResolvePaths<TRouter extends AnyRouter, TSearchPath> =
  RouteByPath<
    TRouter['routeTree'],
    RemoveTrailingSlashes<TSearchPath>
  > extends never
    ? RouteToPath<TRouter, TRouter['routeTree']>
    : RouteToPath<
        TRouter,
        RouteByPath<TRouter['routeTree'], RemoveTrailingSlashes<TSearchPath>>
      >

export type SearchPaths<
  TRouter extends AnyRouter,
  TSearchPath extends string,
  TPaths = ResolvePaths<TRouter, TSearchPath>,
> = TPaths extends `${RemoveTrailingSlashes<TSearchPath>}${infer TRest}`
  ? TRest
  : never

export type SearchRelativePathAutoComplete<
  TRouter extends AnyRouter,
  TTo extends string,
  TSearchPath extends string,
> = `${TTo}/${RemoveLeadingSlashes<SearchPaths<TRouter, TSearchPath>>}`

export type RelativeToParentPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = RemoveTrailingSlashes<
    ResolveRelativePath<TFrom, TTo>
  >,
> =
  | SearchRelativePathAutoComplete<TRouter, TTo, TResolvedPath>
  | (TResolvedPath extends '' ? never : `${TTo}/../`)

export type RelativeToCurrentPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TRestTo extends string,
  TResolvedPath extends
    string = RemoveTrailingSlashes<`${RemoveTrailingSlashes<TFrom>}/${RemoveLeadingSlashes<TRestTo>}`>,
> = SearchRelativePathAutoComplete<TRouter, TTo, TResolvedPath>

export type AbsolutePathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
> =
  | (string extends TFrom
      ? './'
      : TFrom extends `/`
        ? never
        : SearchPaths<TRouter, TFrom> extends ''
          ? never
          : './')
  | (string extends TFrom ? '../' : TFrom extends `/` ? never : '../')
  | RouteToPath<TRouter, TRouter['routeTree']>
  | (TFrom extends '/'
      ? never
      : string extends TFrom
        ? never
        : RemoveLeadingSlashes<SearchPaths<TRouter, TFrom>>)

export type RelativeToPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
> = TTo extends `..${string}`
  ? RelativeToParentPathAutoComplete<TRouter, TFrom, RemoveTrailingSlashes<TTo>>
  : TTo extends `./${infer TRestTTo}`
    ? RelativeToCurrentPathAutoComplete<
        TRouter,
        TFrom,
        RemoveTrailingSlashes<TTo>,
        TRestTTo
      >
    : AbsolutePathAutoComplete<TRouter, TFrom>

export type NavigateOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
> = ToOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & NavigateOptionProps

export interface NavigateOptionProps {
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
  resetScroll?: boolean
  /** @deprecated All navigations now use startTransition under the hood */
  startTransition?: boolean
  // if set to `true`, the router will wrap the resulting navigation in a document.startViewTransition() call.
  viewTransition?: boolean
}

export type ToOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptions<TRouter, TFrom, TTo> & MaskOptions<TRouter, TMaskFrom, TMaskTo>

export interface MaskOptions<
  in out TRouter extends AnyRouter,
  in out TMaskFrom extends RoutePaths<TRouter['routeTree']> | string,
  in out TMaskTo extends string,
> {
  _fromLocation?: ParsedLocation
  mask?: ToMaskOptions<TRouter, TMaskFrom, TMaskTo>
}

export type ToMaskOptions<
  TRouteTree extends AnyRouter = RegisteredRouter,
  TMaskFrom extends RoutePaths<TRouteTree['routeTree']> | string = string,
  TMaskTo extends string = '',
> = ToSubOptions<TRouteTree, TMaskFrom, TMaskTo> & {
  unmaskOnReload?: boolean
}

export type ToSubOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
> = ToSubOptionsProps<TRouter, TFrom, TTo> &
  SearchParamOptions<TRouter, TFrom, TTo> &
  PathParamOptions<TRouter, TFrom, TTo>

export interface ToSubOptionsProps<
  in out TRouter extends AnyRouter = RegisteredRouter,
  in out TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  in out TTo extends string = '',
> {
  to?: ToPathOption<TRouter, TFrom, TTo> & {}
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<HistoryState>
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: RoutePathsAutoComplete<TRouter, TFrom> & {}
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

type ExcludeRootSearchSchema<T> =
  Exclude<T, RootSearchSchema> extends never ? {} : Exclude<T, RootSearchSchema>

export type ResolveRoute<
  TRouter extends AnyRouter,
  TFrom,
  TTo,
  TPath = ResolveRelativePath<TFrom, TTo>,
> = string extends TPath
  ? ParseRouteWithoutBranches<TRouter['routeTree']>
  : TPath extends CatchAllPaths
    ? ParseRouteWithoutBranches<TRouter['routeTree']>
    : TPath extends string
      ? string extends TTo
        ? RouteByPath<TRouter['routeTree'], TPath>
        : RouteByToPath<TRouter, TPath>
      : never

type PostProcessParams<
  T,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'SEARCH' ? ExcludeRootSearchSchema<T> : T

type ResolveFromParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchema'

type ResolveFromParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
> = string extends TFrom
  ? PostProcessParams<
      ParseRoute<
        TRouter['routeTree']
      >['types'][ResolveFromParamType<TParamVariant>],
      TParamVariant
    >
  : RouteByPath<
      TRouter['routeTree'],
      TFrom
    >['types'][ResolveFromParamType<TParamVariant>]

type ResolveToParamType<TParamVariant extends ParamVariant> =
  TParamVariant extends 'PATH' ? 'allParams' : 'fullSearchSchemaInput'

export type ResolveToParams<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
  TRoute extends AnyRoute = ResolveRoute<TRouter, TFrom, TTo>,
> = PostProcessParams<
  TRoute['types'][ResolveToParamType<TParamVariant>],
  TParamVariant
>

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

interface MakeOptionalSearchParams<
  in out TRouter extends AnyRouter,
  in out TFrom,
  in out TTo,
> {
  search?: true | (ParamsReducer<TRouter, 'SEARCH', TFrom, TTo> & {})
}

interface MakeOptionalPathParams<
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

export type IsRequiredParams<TParams> = keyof TParams extends infer K extends
  keyof TParams
  ? K extends any
    ? undefined extends TParams[K]
      ? never
      : true
    : never
  : never

export type IsRequired<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  string extends ResolveRelativePath<TFrom, TTo>
    ? never
    : ResolveRelativePath<TFrom, TTo> extends CatchAllPaths
      ? never
      : IsRequiredParams<
          ResolveRelativeToParams<TRouter, TParamVariant, TFrom, TTo>
        >

export type SearchParamOptions<
  TRouter extends AnyRouter,
  TFrom,
  TTo extends string,
> =
  IsRequired<TRouter, 'SEARCH', TFrom, TTo> extends never
    ? MakeOptionalSearchParams<TRouter, TFrom, TTo>
    : MakeRequiredSearchParams<TRouter, TFrom, TTo>

export type PathParamOptions<
  TRouter extends AnyRouter,
  TFrom,
  TTo extends string,
> =
  IsRequired<TRouter, 'PATH', TFrom, TTo> extends never
    ? MakeOptionalPathParams<TRouter, TFrom, TTo>
    : MakeRequiredPathParams<TRouter, TFrom, TTo>

export type ToPathOption<
  TRouter extends AnyRouter = AnyRouter,
  TFrom extends string = string,
  TTo extends string = string,
> =
  | CheckPath<TRouter, TTo, never, TFrom, TTo>
  | RelativeToPathAutoComplete<
      TRouter,
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
}

export type LinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & LinkOptionsProps

export interface LinkOptionsProps {
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: ActiveOptions
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
}

export type CheckPath<TRouter extends AnyRouter, TPass, TFail, TFrom, TTo> =
  string extends ResolveRelativePath<TFrom, TTo>
    ? TPass
    : ResolveRelativePath<TFrom, TTo> extends CatchAllPaths
      ? TPass
      : ResolveRoute<TRouter, TFrom, TTo> extends never
        ? TFail
        : TPass

export type ResolveRelativePath<TFrom, TTo = '.'> = string extends TFrom
  ? TTo
  : string extends TTo
    ? TFrom
    : TFrom extends string
      ? TTo extends string
        ? TTo extends '.'
          ? TFrom
          : TTo extends `./`
            ? Join<[TFrom, '/']>
            : TTo extends `./${infer TRest}`
              ? ResolveRelativePath<TFrom, TRest>
              : TTo extends `/${infer TRest}`
                ? TTo
                : Split<TTo> extends ['..', ...infer ToRest]
                  ? Split<TFrom> extends [...infer FromRest, infer FromTail]
                    ? ToRest extends ['/']
                      ? Join<['/', ...FromRest, '/']>
                      : ResolveRelativePath<Join<FromRest>, Join<ToRest>>
                    : never
                  : Split<TTo> extends ['.', ...infer ToRest]
                    ? ToRest extends ['/']
                      ? Join<[TFrom, '/']>
                      : ResolveRelativePath<TFrom, Join<ToRest>>
                    : CleanPath<Join<['/', ...Split<TFrom>, ...Split<TTo>]>>
        : never
      : never

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

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

const preloadWarning = 'Error preloading route! ☝️'

export function useLinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  const matchPathname = useMatch({
    strict: false,
    select: (s) => s.pathname,
  })
  const [isTransitioning, setIsTransitioning] = React.useState(false)

  const {
    // custom props
    activeProps = () => ({ className: 'active' }),
    inactiveProps = () => ({}),
    activeOptions,
    hash,
    search,
    params,
    to,
    state,
    mask,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    replace,
    startTransition,
    resetScroll,
    viewTransition,
    // element props
    children,
    target,
    disabled,
    style,
    className,
    onClick,
    onFocus,
    onMouseEnter,
    onMouseLeave,
    onTouchStart,
    ...rest
  } = options

  // If this link simply reloads the current route,
  // make sure it has a new key so it will trigger a data refresh

  // If this `to` is a valid external URL, return
  // null for LinkUtils

  const dest = {
    ...(options.to && { from: matchPathname }),
    ...options,
  }

  let type: 'internal' | 'external' = 'internal'

  try {
    new URL(`${to}`)
    type = 'external'
  } catch {}

  const next = router.buildLocation(dest as any)
  const preload = userPreload ?? router.options.defaultPreload
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      // Compare path/hash for matches
      const currentPathSplit = s.location.pathname.split('/')
      const nextPathSplit = next.pathname.split('/')
      const pathIsFuzzyEqual = nextPathSplit.every(
        (d, i) => d === currentPathSplit[i],
      )
      // Combine the matches based on user router.options
      const pathTest = activeOptions?.exact
        ? exactPathTest(s.location.pathname, next.pathname)
        : pathIsFuzzyEqual
      const hashTest = activeOptions?.includeHash
        ? s.location.hash === next.hash
        : true
      const searchTest =
        activeOptions?.includeSearch ?? true
          ? deepEqual(s.location.search, next.search, !activeOptions?.exact)
          : true

      // The final "active" test
      return pathTest && hashTest && searchTest
    },
  })

  if (type === 'external') {
    return {
      ...rest,
      type,
      href: to,
      ...(children && { children }),
      ...(target && { target }),
      ...(disabled && { disabled }),
      ...(style && { style }),
      ...(className && { className }),
      ...(onClick && { onClick }),
      ...(onFocus && { onFocus }),
      ...(onMouseEnter && { onMouseEnter }),
      ...(onMouseLeave && { onMouseLeave }),
      ...(onTouchStart && { onTouchStart }),
    }
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
      e.preventDefault()

      flushSync(() => {
        setIsTransitioning(true)
      })

      const unsub = router.subscribe('onResolved', () => {
        unsub()
        setIsTransitioning(false)
      })

      // All is well? Navigate!
      router.commitLocation({
        ...next,
        replace,
        resetScroll,
        startTransition,
        viewTransition,
      })
    }
  }

  const doPreload = () => {
    router.preloadRoute(dest as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }

  // The click handler
  const handleFocus = (e: MouseEvent) => {
    if (disabled) return
    if (preload) {
      doPreload()
    }
  }

  const handleTouchStart = handleFocus

  const handleEnter = (e: MouseEvent) => {
    if (disabled) return
    const eventTarget = (e.target || {}) as LinkCurrentTargetElement

    if (preload) {
      if (eventTarget.preloadTimeout) {
        return
      }

      eventTarget.preloadTimeout = setTimeout(() => {
        eventTarget.preloadTimeout = null
        doPreload()
      }, preloadDelay)
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

  const composeHandlers =
    (handlers: Array<undefined | ((e: any) => void)>) =>
    (e: { persist?: () => void; defaultPrevented: boolean }) => {
      e.persist?.()
      handlers.filter(Boolean).forEach((handler) => {
        if (e.defaultPrevented) return
        handler!(e)
      })
    }

  // Get the active props
  const resolvedActiveProps: React.HTMLAttributes<HTMLAnchorElement> = isActive
    ? functionalUpdate(activeProps as any, {}) ?? {}
    : {}

  // Get the inactive props
  const resolvedInactiveProps: React.HTMLAttributes<HTMLAnchorElement> =
    isActive ? {} : functionalUpdate(inactiveProps, {})

  const resolvedClassName = [
    className,
    resolvedActiveProps.className,
    resolvedInactiveProps.className,
  ]
    .filter(Boolean)
    .join(' ')

  const resolvedStyle = {
    ...style,
    ...resolvedActiveProps.style,
    ...resolvedInactiveProps.style,
  }

  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled
      ? undefined
      : next.maskedLocation
        ? router.history.createHref(next.maskedLocation.href)
        : router.history.createHref(next.href),
    onClick: composeHandlers([onClick, handleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    disabled: !!disabled,
    target,
    ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(disabled && {
      role: 'link',
      'aria-disabled': true,
    }),
    ...(isActive && { 'data-status': 'active', 'aria-current': 'page' }),
    ...(isTransitioning && { 'data-transitioning': 'transitioning' }),
  }
}

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>

export type ActiveLinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = LinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & ActiveLinkOptionProps

export interface ActiveLinkOptionProps {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
}

export type LinkProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  LinkPropsChildren

export interface LinkPropsChildren {
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?:
    | React.ReactNode
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => React.ReactNode)
}

type LinkComponentReactProps<TComp> = React.PropsWithoutRef<
  TComp extends React.FC<infer TProps> | React.Component<infer TProps>
    ? TProps
    : TComp extends keyof JSX.IntrinsicElements
      ? Omit<React.HTMLProps<TComp>, 'children' | 'preload'>
      : never
> &
  React.RefAttributes<
    TComp extends
      | React.FC<{ ref: infer TRef }>
      | React.Component<{ ref: infer TRef }>
      ? TRef
      : TComp extends keyof JSX.IntrinsicElements
        ? React.ComponentRef<TComp>
        : never
  >

export type LinkComponentProps<
  TComp,
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = LinkComponentReactProps<TComp> &
  LinkProps<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

export type LinkComponent<TComp> = <
  TRouter extends RegisteredRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string = '',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
>(
  props: LinkComponentProps<TComp, TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
) => React.ReactElement

export function createLink<const TComp>(Comp: TComp): LinkComponent<TComp> {
  return React.forwardRef(function CreatedLink(props, ref) {
    return <Link {...(props as any)} _asChild={Comp} ref={ref} />
  }) as any
}

export const Link: LinkComponent<'a'> = React.forwardRef((props: any, ref) => {
  const { _asChild, ...rest } = props
  const { type, ...linkProps } = useLinkProps(rest)

  const children =
    typeof rest.children === 'function'
      ? rest.children({
          isActive: (linkProps as any)['data-status'] === 'active',
        })
      : rest.children

  if (typeof _asChild === 'undefined') {
    // the ReturnType of useLinkProps returns the correct type for a <a> element, not a general component that has a delete prop
    // @ts-expect-error
    delete linkProps.disabled
  }

  return React.createElement(
    _asChild ? _asChild : 'a',
    {
      ...linkProps,
      ref,
    },
    children,
  )
}) as any

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
