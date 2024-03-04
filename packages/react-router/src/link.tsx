import * as React from 'react'
import { useMatch } from './Matches'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { Trim } from './fileRoute'
import { AnyRoute, ReactNode, RootSearchSchema } from './route'
import { RouteByPath, RoutePaths, RoutePathsAutoComplete } from './routeInfo'
import { RegisteredRouter } from './router'
import { LinkProps, UseLinkPropsOptions } from './useNavigate'
import {
  Expand,
  IsUnion,
  MakeDifferenceOptional,
  NoInfer,
  NonNullableUpdater,
  PickRequired,
  Updater,
  WithoutEmpty,
  deepEqual,
  functionalUpdate,
} from './utils'
import { HistoryState } from '@tanstack/history'

export type CleanPath<T extends string> = T extends `${infer L}//${infer R}`
  ? CleanPath<`${CleanPath<L>}/${CleanPath<R>}`>
  : T extends `${infer L}//`
    ? `${CleanPath<L>}/`
    : T extends `//${infer L}`
      ? `/${CleanPath<L>}`
      : T

export type Split<S, TIncludeTrailingSlash = true> = S extends unknown
  ? string extends S
    ? string[]
    : S extends string
      ? CleanPath<S> extends ''
        ? []
        : TIncludeTrailingSlash extends true
          ? CleanPath<S> extends `${infer T}/`
            ? [...Split<T>, '/']
            : CleanPath<S> extends `/${infer U}`
              ? Split<U>
              : CleanPath<S> extends `${infer T}/${infer U}`
                ? [...Split<T>, ...Split<U>]
                : [S]
          : CleanPath<S> extends `${infer T}/${infer U}`
            ? [...Split<T>, ...Split<U>]
            : S extends string
              ? [S]
              : never
      : never
  : never

export type ParsePathParams<T extends string> = keyof {
  [K in Trim<Split<T>[number], '_'> as K extends `$${infer L}`
    ? L extends ''
      ? '_splat'
      : L
    : never]: K
}

export type Join<T, Delimiter extends string = '/'> = T extends []
  ? ''
  : T extends [infer L extends string]
    ? L
    : T extends [infer L extends string, ...infer Tail extends [...string[]]]
      ? CleanPath<`${L}${Delimiter}${Join<Tail>}`>
      : never

export type Last<T extends any[]> = T extends [...infer _, infer L] ? L : never

export type RemoveTrailingSlashes<T> = T extends `${infer R}/`
  ? RemoveTrailingSlashes<R>
  : T

export type RemoveLeadingSlashes<T> = T extends `/${infer R}`
  ? RemoveLeadingSlashes<R>
  : T

export type SearchPaths<
  TPaths,
  TSearchPath extends string,
> = TPaths extends `${TSearchPath}/${infer TRest}` ? TRest : never

export type SearchRelativePathAutoComplete<
  TTo extends string,
  TSearchPath extends string,
  TPaths,
  SearchedPaths = SearchPaths<TPaths, TSearchPath>,
> = SearchedPaths extends string ? `${TTo}/${SearchedPaths}` : never

export type RelativeToParentPathAutoComplete<
  TFrom extends string,
  TTo extends string,
  TPaths,
  TResolvedPath extends string = RemoveTrailingSlashes<
    ResolveRelativePath<TFrom, TTo>
  >,
> =
  | SearchRelativePathAutoComplete<TTo, TResolvedPath, TPaths>
  | (TResolvedPath extends '' ? never : `${TTo}/../`)

export type RelativeToCurrentPathAutoComplete<
  TFrom extends string,
  TTo extends string,
  TRestTo extends string,
  TPaths,
  TResolvedPath extends
    string = RemoveTrailingSlashes<`${RemoveTrailingSlashes<TFrom>}/${RemoveLeadingSlashes<TRestTo>}`>,
> = SearchRelativePathAutoComplete<TTo, TResolvedPath, TPaths>

export type AbsolutePathAutoComplete<TFrom extends string, TPaths> =
  | (string extends TFrom
      ? './'
      : TFrom extends `/`
        ? never
        : SearchPaths<
              TPaths,
              RemoveTrailingSlashes<TFrom>
            > extends infer SearchedPaths
          ? SearchedPaths extends ''
            ? never
            : './'
          : never)
  | (string extends TFrom ? '../' : TFrom extends `/` ? never : '../')
  | TPaths

export type RelativeToPathAutoComplete<
  TRouteTree extends AnyRoute,
  TFrom extends string,
  TTo extends string,
  TPaths = RoutePaths<TRouteTree>,
> = TTo extends `..${string}`
  ? RelativeToParentPathAutoComplete<TFrom, RemoveTrailingSlashes<TTo>, TPaths>
  : TTo extends `./${infer TRestTTo}`
    ? RelativeToCurrentPathAutoComplete<
        TFrom,
        RemoveTrailingSlashes<TTo>,
        TRestTTo,
        TPaths
      >
    : AbsolutePathAutoComplete<TFrom, TPaths>

export type NavigateOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
  resetScroll?: boolean
  // If set to `true`, the link's underlying navigate() call will be wrapped in a `React.startTransition` call. Defaults to `true`.
  startTransition?: boolean
}

export type ToOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ToSubOptions<TRouteTree, TFrom, TTo> & {
  mask?: ToMaskOptions<TRouteTree, TMaskFrom, TMaskTo>
}

export type ToMaskOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TMaskFrom extends RoutePaths<TRouteTree> | string = string,
  TMaskTo extends string = '',
> = ToSubOptions<TRouteTree, TMaskFrom, TMaskTo> & {
  unmaskOnReload?: boolean
}

export type ToSubOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
> = {
  to?: ToPathOption<TRouteTree, TFrom, TTo>
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<HistoryState>
  // The source route path. This is automatically set when using route-level APIs, but for type-safe relative routing on the router itself, this is required
  from?: RoutePathsAutoComplete<TRouteTree, TFrom>
  // // When using relative route paths, this option forces resolution from the current path, instead of the route API's path or `from` path
} & CheckPath<TRouteTree, {}, TFrom, TTo> &
  SearchParamOptions<TRouteTree, TFrom, TTo> &
  PathParamOptions<TRouteTree, TFrom, TTo>

type ParamsReducer<TFrom, TTo> = TTo | ((current: TFrom) => TTo)

type ParamVariant = 'PATH' | 'SEARCH'
type ExcludeRootSearchSchema<T, Excluded = Exclude<T, RootSearchSchema>> = [
  Excluded,
] extends [never]
  ? {}
  : Excluded

export type ResolveRoute<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo,
  TPath = RemoveTrailingSlashes<
    string extends TTo ? TFrom : ResolveRelativePath<TFrom, TTo>
  >,
> =
  RouteByPath<TRouteTree, `${TPath & string}/`> extends never
    ? RouteByPath<TRouteTree, TPath>
    : RouteByPath<TRouteTree, `${TPath & string}/`>

type PostProcessParams<
  T,
  TParamVariant extends ParamVariant,
> = TParamVariant extends 'SEARCH' ? ExcludeRootSearchSchema<T> : T

export type ParamOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo extends string,
  TParamVariant extends ParamVariant,
  TFromRouteType extends
    | 'allParams'
    | 'fullSearchSchema' = TParamVariant extends 'PATH'
    ? 'allParams'
    : 'fullSearchSchema',
  TToRouteType extends
    | 'allParams'
    | 'fullSearchSchemaInput' = TParamVariant extends 'PATH'
    ? 'allParams'
    : 'fullSearchSchemaInput',
  TFromParams = PostProcessParams<
    RouteByPath<TRouteTree, TFrom>['types'][TFromRouteType],
    TParamVariant
  >,
  TToParams = PostProcessParams<
    ResolveRoute<TRouteTree, TFrom, TTo>['types'][TToRouteType],
    TParamVariant
  >,
  TRelativeToParams = TParamVariant extends 'SEARCH'
    ? TToParams
    : true extends IsUnion<TFromParams>
      ? TToParams
      : MakeDifferenceOptional<TFromParams, TToParams>,
  TReducer = ParamsReducer<TFromParams, TRelativeToParams>,
> =
  Expand<WithoutEmpty<PickRequired<TRelativeToParams>>> extends never
    ? Partial<MakeParamOption<TParamVariant, true | TReducer>>
    : TFromParams extends Expand<WithoutEmpty<PickRequired<TRelativeToParams>>>
      ? MakeParamOption<TParamVariant, true | TReducer>
      : MakeParamOption<TParamVariant, TReducer>

type MakeParamOption<
  TParamVariant extends ParamVariant,
  T,
> = TParamVariant extends 'PATH'
  ? MakePathParamOptions<T>
  : MakeSearchParamOptions<T>
type MakeSearchParamOptions<T> = { search: T }
type MakePathParamOptions<T> = { params: T }

export type SearchParamOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo extends string,
> = ParamOptions<TRouteTree, TFrom, TTo, 'SEARCH'>

export type PathParamOptions<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo extends string,
> = ParamOptions<TRouteTree, TFrom, TTo, 'PATH'>

export type ToPathOption<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
> =
  | TTo
  | RelativeToPathAutoComplete<
      TRouteTree,
      NoInfer<TFrom> extends string ? NoInfer<TFrom> : '',
      NoInfer<TTo> & string
    >

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
}

export type LinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
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

export type CheckPath<TRouteTree extends AnyRoute, TPass, TFrom, TTo> =
  ResolveRoute<TRouteTree, TFrom, TTo> extends never
    ? string extends TFrom
      ? RemoveTrailingSlashes<TTo> extends '.' | '..'
        ? TPass
        : CheckPathError<TRouteTree>
      : CheckPathError<TRouteTree>
    : TPass

export type CheckPathError<TRouteTree extends AnyRoute> = {
  to: RoutePaths<TRouteTree>
}

export type ResolveRelativePath<TFrom, TTo = '.'> = TFrom extends string
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

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

const preloadWarning = 'Error preloading route! ☝️'

export function useLinkProps<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>,
): React.AnchorHTMLAttributes<HTMLAnchorElement> {
  const router = useRouter()
  const matchPathname = useMatch({
    strict: false,
    select: (s) => s.pathname,
  })

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
    from: options.to ? matchPathname : undefined,
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
        ? s.location.pathname === next.pathname
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

      // All is well? Navigate!
      router.commitLocation({ ...next, replace, resetScroll, startTransition })
    }
  }

  const doPreload = () => {
    React.startTransition(() => {
      router.preloadRoute(dest as any).catch((err) => {
        console.warn(err)
        console.warn(preloadWarning)
      })
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
    const target = (e.target || {}) as LinkCurrentTargetElement

    if (preload) {
      if (target.preloadTimeout) {
        return
      }

      target.preloadTimeout = setTimeout(() => {
        target.preloadTimeout = null
        doPreload()
      }, preloadDelay)
    }
  }

  const handleLeave = (e: MouseEvent) => {
    if (disabled) return
    const target = (e.target || {}) as LinkCurrentTargetElement

    if (target.preloadTimeout) {
      clearTimeout(target.preloadTimeout)
      target.preloadTimeout = null
    }
  }

  const composeHandlers =
    (handlers: (undefined | ((e: any) => void))[]) =>
    (e: React.SyntheticEvent) => {
      if (e.persist) e.persist()
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
    isActive ? {} : functionalUpdate(inactiveProps, {}) ?? {}

  return {
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    ...rest,
    href: disabled
      ? undefined
      : next.maskedLocation
        ? next.maskedLocation.href
        : next.href,
    onClick: composeHandlers([onClick, handleClick]),
    onFocus: composeHandlers([onFocus, handleFocus]),
    onMouseEnter: composeHandlers([onMouseEnter, handleEnter]),
    onMouseLeave: composeHandlers([onMouseLeave, handleLeave]),
    onTouchStart: composeHandlers([onTouchStart, handleTouchStart]),
    target,
    style: {
      ...style,
      ...resolvedActiveProps.style,
      ...resolvedInactiveProps.style,
    },
    className:
      [
        className,
        resolvedActiveProps.className,
        resolvedInactiveProps.className,
      ]
        .filter(Boolean)
        .join(' ') || undefined,
    ...(disabled
      ? {
          role: 'link',
          'aria-disabled': true,
        }
      : undefined),
    ['data-status']: isActive ? 'active' : undefined,
  }
}

export interface LinkComponent<TProps extends Record<string, any> = {}> {
  <
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TFrom extends RoutePaths<TRouteTree> | string = string,
    TTo extends string = '',
    TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
    TMaskTo extends string = '',
  >(
    props: LinkProps<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
      TProps &
      React.RefAttributes<HTMLAnchorElement>,
  ): ReactNode
}

export const Link: LinkComponent = React.forwardRef((props: any, ref) => {
  const { type, ...linkProps } = useLinkProps(props)

  const children =
    typeof props.children === 'function'
      ? props.children({
          isActive: (linkProps as any)['data-status'] === 'active',
        })
      : props.children

  return <a {...linkProps} ref={ref} children={children} />
})

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
