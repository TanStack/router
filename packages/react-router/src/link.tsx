'use client'

import * as React from 'react'
import { flushSync } from 'react-dom'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import {
  deepEqual,
  functionalUpdate,
  useForwardedRef,
  useIntersectionObserver,
  useLayoutEffect,
} from './utils'
import { exactPathTest, removeTrailingSlash } from './path'
import { useMatch } from './useMatch'
import type { ParsedLocation } from './location'
import type { HistoryState, ParsedHistoryState } from '@tanstack/history'
import type {
  AllParams,
  CatchAllPaths,
  CurrentPath,
  FullSearchSchema,
  FullSearchSchemaInput,
  ParentPath,
  RouteByPath,
  RouteByToPath,
  RoutePaths,
  RouteToPath,
  ToPath,
} from './routeInfo'
import type {
  AnyRouter,
  RegisteredRouter,
  ViewTransitionOptions,
} from './router'
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
} from './utils'
import type { ReactNode } from 'react'
import type {
  ValidateLinkOptions,
  ValidateLinkOptionsArray,
} from './typePrimitives'

export type ParsePathParams<T extends string, TAcc = never> = T &
  `${string}$${string}` extends never
  ? TAcc
  : T extends `${string}$${infer TPossiblyParam}`
    ? TPossiblyParam extends ''
      ? TAcc
      : TPossiblyParam & `${string}/${string}` extends never
        ? TPossiblyParam | TAcc
        : TPossiblyParam extends `${infer TParam}/${infer TRest}`
          ? ParsePathParams<TRest, TParam extends '' ? TAcc : TParam | TAcc>
          : never
    : TAcc

export type AddTrailingSlash<T> = T extends `${string}/` ? T : `${T & string}/`

export type RemoveTrailingSlashes<T> = T extends `${string}/`
  ? T extends `${infer R}/`
    ? R
    : T
  : T

export type AddLeadingSlash<T> = T extends `/${string}` ? T : `/${T & string}`

export type RemoveLeadingSlashes<T> = T extends `/${string}`
  ? T extends `/${infer R}`
    ? R
    : T
  : T

export type FindDescendantToPaths<
  TRouter extends AnyRouter,
  TPrefix extends string,
> = `${TPrefix}/${string}` & RouteToPath<TRouter>

export type InferDescendantToPaths<
  TRouter extends AnyRouter,
  TPrefix extends string,
  TPaths = FindDescendantToPaths<TRouter, TPrefix>,
> = TPaths extends `${TPrefix}/`
  ? never
  : TPaths extends `${TPrefix}/${infer TRest}`
    ? TRest
    : never

export type RelativeToPath<
  TRouter extends AnyRouter,
  TTo extends string,
  TResolvedPath extends string,
> =
  | (TResolvedPath & RouteToPath<TRouter> extends never
      ? never
      : ToPath<TRouter, TTo>)
  | `${RemoveTrailingSlashes<TTo>}/${InferDescendantToPaths<TRouter, RemoveTrailingSlashes<TResolvedPath>>}`

export type RelativeToParentPath<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = ResolveRelativePath<TFrom, TTo>,
> =
  | RelativeToPath<TRouter, TTo, TResolvedPath>
  | (TTo extends `${string}..` | `${string}../`
      ? TResolvedPath extends '/' | ''
        ? never
        : FindDescendantToPaths<
              TRouter,
              RemoveTrailingSlashes<TResolvedPath>
            > extends never
          ? never
          : `${RemoveTrailingSlashes<TTo>}/${ParentPath<TRouter>}`
      : never)

export type RelativeToCurrentPath<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
  TResolvedPath extends string = ResolveRelativePath<TFrom, TTo>,
> = RelativeToPath<TRouter, TTo, TResolvedPath> | CurrentPath<TRouter>

export type AbsoluteToPath<TRouter extends AnyRouter, TFrom extends string> =
  | (string extends TFrom
      ? CurrentPath<TRouter>
      : TFrom extends `/`
        ? never
        : CurrentPath<TRouter>)
  | (string extends TFrom
      ? ParentPath<TRouter>
      : TFrom extends `/`
        ? never
        : ParentPath<TRouter>)
  | RouteToPath<TRouter>
  | (TFrom extends '/'
      ? never
      : string extends TFrom
        ? never
        : InferDescendantToPaths<TRouter, RemoveTrailingSlashes<TFrom>>)

export type RelativeToPathAutoComplete<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string,
> = string extends TTo
  ? string
  : string extends TFrom
    ? AbsoluteToPath<TRouter, TFrom>
    : TTo & `..${string}` extends never
      ? TTo & `.${string}` extends never
        ? AbsoluteToPath<TRouter, TFrom>
        : RelativeToCurrentPath<TRouter, TFrom, TTo>
      : RelativeToParentPath<TRouter, TFrom, TTo>

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

export interface RequiredToOptions<
  in out TRouter extends AnyRouter,
  in out TFrom extends string,
  in out TTo extends string | undefined,
> {
  to: ToPathOption<TRouter, TFrom, TTo> & {}
}

export interface OptionalToOptions<
  in out TRouter extends AnyRouter,
  in out TFrom extends string,
  in out TTo extends string | undefined,
> {
  to?: ToPathOption<TRouter, TFrom, TTo> & {}
}

export type MakeToRequired<
  TRouter extends AnyRouter,
  TFrom extends string,
  TTo extends string | undefined,
> = string extends TFrom
  ? string extends TTo
    ? OptionalToOptions<TRouter, TFrom, TTo>
    : TTo & CatchAllPaths<TRouter> extends never
      ? RequiredToOptions<TRouter, TFrom, TTo>
      : OptionalToOptions<TRouter, TFrom, TTo>
  : OptionalToOptions<TRouter, TFrom, TTo>

export type ToSubOptionsProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
> = MakeToRequired<TRouter, TFrom, TTo> & {
  hash?: true | Updater<string>
  state?: true | NonNullableUpdater<ParsedHistoryState, HistoryState>
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
        : TPath extends CatchAllPaths<TRouter>
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

export type IsRequiredParams<TParams> =
  Record<never, never> extends TParams ? never : true

export type IsRequired<
  TRouter extends AnyRouter,
  TParamVariant extends ParamVariant,
  TFrom,
  TTo,
> =
  ResolveRelativePath<TFrom, TTo> extends infer TPath
    ? undefined extends TPath
      ? never
      : TPath extends CatchAllPaths<TRouter>
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

export interface ActiveOptions {
  exact?: boolean
  includeHash?: boolean
  includeSearch?: boolean
  explicitUndefined?: boolean
}

export type LinkOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo> & LinkOptionsProps

export interface LinkOptionsProps {
  /**
   * The standard anchor tag target attribute
   */
  target?: HTMLAnchorElement['target']
  /**
   * Configurable options to determine if the link should be considered active or not
   * @default {exact:true,includeHash:true}
   */
  activeOptions?: ActiveOptions
  /**
   * The preloading strategy for this link
   * - `false` - No preloading
   * - `'intent'` - Preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
   * - `'viewport'` - Preload the linked route when it enters the viewport
   */
  preload?: false | 'intent' | 'viewport' | 'render'
  /**
   * When a preload strategy is set, this delays the preload by this many milliseconds.
   * If the user exits the link before this delay, the preload will be cancelled.
   */
  preloadDelay?: number
  /**
   * Control whether the link should be disabled or not
   * If set to `true`, the link will be rendered without an `href` attribute
   * @default false
   */
  disabled?: boolean
}

type JoinPath<TLeft extends string, TRight extends string> = TRight extends ''
  ? TLeft
  : TLeft extends ''
    ? TRight
    : `${RemoveTrailingSlashes<TLeft>}/${RemoveLeadingSlashes<TRight>}`

type RemoveLastSegment<
  T extends string,
  TAcc extends string = '',
> = T extends `${infer TSegment}/${infer TRest}`
  ? TRest & `${string}/${string}` extends never
    ? TRest extends ''
      ? TAcc
      : `${TAcc}${TSegment}`
    : RemoveLastSegment<TRest, `${TAcc}${TSegment}/`>
  : TAcc

export type ResolveCurrentPath<
  TFrom extends string,
  TTo extends string,
> = TTo extends '.'
  ? TFrom
  : TTo extends './'
    ? AddTrailingSlash<TFrom>
    : TTo & `./${string}` extends never
      ? never
      : TTo extends `./${infer TRest}`
        ? AddLeadingSlash<JoinPath<TFrom, TRest>>
        : never

export type ResolveParentPath<
  TFrom extends string,
  TTo extends string,
> = TTo extends '../' | '..'
  ? TFrom extends '' | '/'
    ? never
    : AddLeadingSlash<RemoveLastSegment<TFrom>>
  : TTo & `../${string}` extends never
    ? AddLeadingSlash<JoinPath<TFrom, TTo>>
    : TFrom extends '' | '/'
      ? never
      : TTo extends `../${infer ToRest}`
        ? ResolveParentPath<RemoveLastSegment<TFrom>, ToRest>
        : AddLeadingSlash<JoinPath<TFrom, TTo>>

export type ResolveRelativePath<TFrom, TTo = '.'> = string extends TFrom
  ? TTo
  : string extends TTo
    ? TFrom
    : undefined extends TTo
      ? TFrom
      : TTo extends string
        ? TFrom extends string
          ? TTo extends `/${string}`
            ? TTo
            : TTo extends `..${string}`
              ? ResolveParentPath<TFrom, TTo>
              : TTo extends `.${string}`
                ? ResolveCurrentPath<TFrom, TTo>
                : AddLeadingSlash<JoinPath<TFrom, TTo>>
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
  const TFrom extends string = string,
  const TTo extends string | undefined = undefined,
  const TMaskFrom extends string = TFrom,
  const TMaskTo extends string = '',
>(
  options: UseLinkPropsOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>,
  forwardedRef?: React.ForwardedRef<Element>,
): React.ComponentPropsWithRef<'a'> {
  const router = useRouter()
  const [isTransitioning, setIsTransitioning] = React.useState(false)
  const hasRenderFetched = React.useRef(false)
  const innerRef = useForwardedRef(forwardedRef)

  const {
    // custom props
    activeProps = () => ({ className: 'active' }),
    inactiveProps = () => ({}),
    activeOptions,
    to,
    preload: userPreload,
    preloadDelay: userPreloadDelay,
    hashScrollIntoView,
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
    ignoreBlocker,
    ...rest
  } = options

  const {
    // prevent these from being returned
    params: _params,
    search: _search,
    hash: _hash,
    state: _state,
    mask: _mask,
    reloadDocument: _reloadDocument,
    ...propsSafeToSpread
  } = rest

  // If this link simply reloads the current route,
  // make sure it has a new key so it will trigger a data refresh

  // If this `to` is a valid external URL, return
  // null for LinkUtils

  const type: 'internal' | 'external' = React.useMemo(() => {
    try {
      new URL(`${to}`)
      return 'external'
    } catch {}
    return 'internal'
  }, [to])

  // subscribe to search params to re-build location if it changes
  const currentSearch = useRouterState({
    select: (s) => s.location.search,
    structuralSharing: true as any,
  })

  // In the rare event that the user bypasses type-safety and doesn't supply a `from`
  // we'll use the current route as the `from` location so relative routing works as expected
  const parentRouteId = useMatch({ strict: false, select: (s) => s.pathname })

  // Use it as the default `from` location
  options = {
    from: parentRouteId,
    ...options,
  }

  const next = React.useMemo(
    () => router.buildLocation(options as any),
    [router, options, currentSearch],
  )
  const preload = React.useMemo(() => {
    if (options.reloadDocument) {
      return false
    }
    return userPreload ?? router.options.defaultPreload
  }, [router.options.defaultPreload, userPreload, options.reloadDocument])
  const preloadDelay =
    userPreloadDelay ?? router.options.defaultPreloadDelay ?? 0

  const isActive = useRouterState({
    select: (s) => {
      if (activeOptions?.exact) {
        const testExact = exactPathTest(
          s.location.pathname,
          next.pathname,
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
          next.pathname,
          router.basepath,
        ).split('/')

        const pathIsFuzzyEqual = nextPathSplit.every(
          (d, i) => d === currentPathSplit[i],
        )
        if (!pathIsFuzzyEqual) {
          return false
        }
      }

      if (activeOptions?.includeSearch ?? true) {
        const searchTest = deepEqual(s.location.search, next.search, {
          partial: !activeOptions?.exact,
          ignoreUndefined: !activeOptions?.explicitUndefined,
        })
        if (!searchTest) {
          return false
        }
      }

      if (activeOptions?.includeHash) {
        return s.location.hash === next.hash
      }
      return true
    },
  })

  const doPreload = React.useCallback(() => {
    router.preloadRoute(options as any).catch((err) => {
      console.warn(err)
      console.warn(preloadWarning)
    })
  }, [options, router])

  const preloadViewportIoCallback = React.useCallback(
    (entry: IntersectionObserverEntry | undefined) => {
      if (entry?.isIntersecting) {
        doPreload()
      }
    },
    [doPreload],
  )

  useIntersectionObserver(
    innerRef,
    preloadViewportIoCallback,
    { rootMargin: '100px' },
    { disabled: !!disabled || !(preload === 'viewport') },
  )

  useLayoutEffect(() => {
    if (hasRenderFetched.current) {
      return
    }
    if (!disabled && preload === 'render') {
      doPreload()
      hasRenderFetched.current = true
    }
  }, [disabled, doPreload, preload])

  if (type === 'external') {
    return {
      ...propsSafeToSpread,
      ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
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
      // N.B. we don't call `router.commitLocation(next) here because we want to run `validateSearch` before committing
      return router.navigate({
        ...options,
        replace,
        resetScroll,
        hashScrollIntoView,
        startTransition,
        viewTransition,
        ignoreBlocker,
      } as any)
    }
  }

  // The click handler
  const handleFocus = (_: MouseEvent) => {
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
    ? (functionalUpdate(activeProps as any, {}) ?? {})
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
    ...propsSafeToSpread,
    ...resolvedActiveProps,
    ...resolvedInactiveProps,
    href: disabled
      ? undefined
      : next.maskedLocation
        ? router.history.createHref(next.maskedLocation.href)
        : router.history.createHref(next.href),
    ref: innerRef as React.ComponentPropsWithRef<'a'>['ref'],
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

type UseLinkReactProps<TComp> = TComp extends keyof React.JSX.IntrinsicElements
  ? React.JSX.IntrinsicElements[TComp]
  : React.PropsWithoutRef<
      TComp extends React.ComponentType<infer TProps> ? TProps : never
    > &
      React.RefAttributes<
        TComp extends
          | React.FC<{ ref: infer TRef }>
          | React.Component<{ ref: infer TRef }>
          ? TRef
          : never
      >

export type UseLinkPropsOptions<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends RoutePaths<TRouter['routeTree']> | string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends RoutePaths<TRouter['routeTree']> | string = TFrom,
  TMaskTo extends string = '.',
> = ActiveLinkOptions<'a', TRouter, TFrom, TTo, TMaskFrom, TMaskTo> &
  UseLinkReactProps<'a'>

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
  LinkComponentReactProps<TComp> & {
    [key: `data-${string}`]: unknown
  }
>

export interface ActiveLinkOptionProps<TComp = 'a'> {
  /**
   * A function that returns additional props for the `active` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
   */
  activeProps?: ActiveLinkProps<TComp> | (() => ActiveLinkProps<TComp>)
  /**
   * A function that returns additional props for the `inactive` state of this link.
   * These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
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
    | React.ReactNode
    | ((state: {
        isActive: boolean
        isTransitioning: boolean
      }) => React.ReactNode)
}

type LinkComponentReactProps<TComp> = Omit<
  UseLinkReactProps<TComp>,
  keyof CreateLinkProps
>

export type LinkComponentProps<
  TComp = 'a',
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = '.',
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '.',
> = LinkComponentReactProps<TComp> &
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
) => React.ReactElement

export function createLink<const TComp>(
  Comp: Constrain<TComp, any, (props: CreateLinkProps) => ReactNode>,
): LinkComponent<TComp> {
  return React.forwardRef(function CreatedLink(props, ref) {
    return <Link {...(props as any)} _asChild={Comp} ref={ref} />
  }) as any
}

export const Link: LinkComponent<'a'> = React.forwardRef<Element, any>(
  (props, ref) => {
    const { _asChild, ...rest } = props
    const {
      type: _type,
      ref: innerRef,
      ...linkProps
    } = useLinkProps(rest as any, ref)

    const children =
      typeof rest.children === 'function'
        ? rest.children({
            isActive: (linkProps as any)['data-status'] === 'active',
          })
        : rest.children

    if (typeof _asChild === 'undefined') {
      // the ReturnType of useLinkProps returns the correct type for a <a> element, not a general component that has a disabled prop
      // @ts-expect-error
      delete linkProps.disabled
    }

    return React.createElement(
      _asChild ? _asChild : 'a',
      {
        ...linkProps,
        ref: innerRef,
      },
      children,
    )
  },
) as any

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export type LinkOptionsFnOptions<
  TOptions,
  TComp,
  TRouter extends AnyRouter = RegisteredRouter,
> =
  TOptions extends ReadonlyArray<any>
    ? ValidateLinkOptionsArray<TOptions, TComp, TRouter>
    : ValidateLinkOptions<TOptions, TComp, TRouter>

export type LinkOptionsFn<TComp> = <
  const TOptions,
  TRouter extends AnyRouter = RegisteredRouter,
>(
  options: LinkOptionsFnOptions<TOptions, TComp, TRouter>,
) => TOptions

export const linkOptions: LinkOptionsFn<'a'> = (options) => {
  return options as any
}
