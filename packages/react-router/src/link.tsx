import * as React from 'react'
import { useMatch } from './Matches'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { deepEqual, exactPathTest, functionalUpdate } from './utils'
import type { HistoryState } from '@tanstack/history'
import type { Trim } from './fileRoute'
import type { AnyRoute, RootSearchSchema } from './route'
import type {
  RouteByPath,
  RoutePaths,
  RoutePathsAutoComplete,
} from './routeInfo'
import type { RegisteredRouter } from './router'
import type {
  Expand,
  IsUnion,
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

export type ParsePathParams<T extends string> = keyof {
  [K in Trim<Split<T>[number], '_'> as K extends `$${infer L}`
    ? L extends ''
      ? '_splat'
      : L
    : never]: K
}

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
  TSearchedPaths = SearchPaths<TPaths, TSearchPath>,
> = TSearchedPaths extends string ? `${TTo}/${TSearchedPaths}` : never

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
type ExcludeRootSearchSchema<T, TExcluded = Exclude<T, RootSearchSchema>> = [
  TExcluded,
] extends [never]
  ? {}
  : TExcluded

export type ResolveRoute<
  TRouteTree extends AnyRoute,
  TFrom,
  TTo,
  TPath = RemoveTrailingSlashes<
    string extends TFrom
      ? TTo
      : string extends TTo
        ? TFrom
        : ResolveRelativePath<TFrom, TTo>
  >,
> = TPath extends string
  ? RouteByPath<TRouteTree, `${TPath}/`> extends never
    ? RouteByPath<TRouteTree, TPath>
    : RouteByPath<TRouteTree, `${TPath}/`>
  : never

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
> = keyof PickRequired<TRelativeToParams> extends never
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
    ? CheckPathError<TRouteTree>
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
    (e: React.SyntheticEvent) => {
      e.persist()
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
    target,
    ...(Object.keys(resolvedStyle).length && { style: resolvedStyle }),
    ...(resolvedClassName && { className: resolvedClassName }),
    ...(disabled && {
      role: 'link',
      'aria-disabled': true,
    }),
    ...(isActive && { 'data-status': 'active' }),
  }
}

export type UseLinkPropsOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
  React.AnchorHTMLAttributes<HTMLAnchorElement>

export type ActiveLinkOptions<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = LinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
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
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
> = ActiveLinkOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> & {
  // If a function is passed as a child, it will be given the `isActive` boolean to aid in further styling on the element it returns
  children?:
    | React.ReactNode
    | ((state: { isActive: boolean }) => React.ReactNode)
}

export type LinkComponent<TComp> = <
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> | string = TFrom,
  TMaskTo extends string = '',
>(
  props: React.PropsWithoutRef<
    LinkProps<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo> &
      (TComp extends React.FC<infer TProps> | React.Component<infer TProps>
        ? TProps
        : TComp extends keyof JSX.IntrinsicElements
          ? Omit<React.HTMLProps<TComp>, 'children' | 'preload'>
          : never)
  > &
    React.RefAttributes<
      TComp extends
        | React.FC<{ ref: infer TRef }>
        | React.Component<{ ref: infer TRef }>
        ? TRef
        : TComp extends keyof JSX.IntrinsicElements
          ? React.ComponentRef<TComp>
          : never
    >,
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
