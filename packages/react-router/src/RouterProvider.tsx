import * as React from 'react'
import { AnyPathParams, AnySearchSchema, Route } from './route'
import {
  RegisteredRouter,
  DehydratedRouteMatch,
  componentTypes,
  BuildNextOptions,
  RouterOptions,
} from './router'
import { ParsedLocation } from './location'
import { AnyRouteMatch } from './RouteMatch'
import { RouteMatch } from './RouteMatch'
import { isRedirect } from './redirects'
import {
  functionalUpdate,
  replaceEqualDeep,
  useStableCallback,
  last,
  pick,
  partialDeepEqual,
  NoInfer,
  PickAsRequired,
} from './utils'
import { RouterProps, Matches } from './react'
import {
  cleanPath,
  interpolatePath,
  joinPaths,
  matchPathname,
  parsePathname,
  resolvePath,
  trimPath,
  trimPathRight,
} from './path'
import invariant from 'tiny-invariant'
import {
  FullSearchSchema,
  RouteById,
  RoutePaths,
  RoutesById,
  RoutesByPath,
} from './routeInfo'
import {
  LinkInfo,
  LinkOptions,
  NavigateOptions,
  ResolveRelativePath,
  ToOptions,
} from './link'
import {
  HistoryLocation,
  HistoryState,
  RouterHistory,
  createBrowserHistory,
} from '.'
import { AnyRoute } from './route'
import { RouterState } from './router'

export interface CommitLocationOptions {
  replace?: boolean
  resetScroll?: boolean
}

export interface MatchLocation {
  to?: string | number | null
  fuzzy?: boolean
  caseSensitive?: boolean
  from?: string
}

export interface MatchRouteOptions {
  pending?: boolean
  caseSensitive?: boolean
  includeSearch?: boolean
  fuzzy?: boolean
}

type LinkCurrentTargetElement = {
  preloadTimeout?: null | ReturnType<typeof setTimeout>
}

export type BuildLinkFn<TRouteTree extends AnyRoute> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
>(
  state: RouterState,
  dest: LinkOptions<TRouteTree, TFrom, TTo>,
) => LinkInfo

export type NavigateFn<TRouteTree extends AnyRoute> = <
  TRouteTree extends AnyRoute,
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TMaskFrom extends RoutePaths<TRouteTree> = TFrom,
  TMaskTo extends string = '',
>({
  from,
  to = '' as any,
  ...rest
}: NavigateOptions<TRouteTree, TFrom, TTo, TMaskFrom, TMaskTo>) => Promise<void>

export type MatchRouteFn<TRouteTree extends AnyRoute> = <
  TFrom extends RoutePaths<TRouteTree> = '/',
  TTo extends string = '',
  TResolved = ResolveRelativePath<TFrom, NoInfer<TTo>>,
>(
  state: RouterState<TRouteTree>,
  location: ToOptions<TRouteTree, TFrom, TTo>,
  opts?: MatchRouteOptions,
) => false | RouteById<TRouteTree, TResolved>['types']['allParams']

export type LoadFn = (opts?: {
  next?: ParsedLocation
  throwOnError?: boolean
  __dehydratedMatches?: DehydratedRouteMatch[]
}) => Promise<void>

const preloadWarning = 'Error preloading route! ☝️'

export type RouterContext<
  TRouteTree extends AnyRoute,
  // TDehydrated extends Record<string, any>,
> = {
  buildLink: BuildLinkFn<TRouteTree>
  state: RouterState<TRouteTree>
  navigate: NavigateFn<TRouteTree>
  matchRoute: MatchRouteFn<TRouteTree>
  routeTree: TRouteTree
  routesById: RoutesById<TRouteTree>
  options: RouterOptions<TRouteTree>
  history: RouterHistory
  load: LoadFn
}

export const routerContext = React.createContext<RouterContext<any>>(null!)

if (typeof document !== 'undefined') {
  window.__TSR_ROUTER_CONTEXT__ = routerContext as any
}

export function getInitialRouterState(
  location: ParsedLocation,
): RouterState<any> {
  return {
    status: 'idle',
    isFetching: false,
    resolvedLocation: location!,
    location: location!,
    matches: [],
    pendingMatches: [],
    lastUpdated: Date.now(),
  }
}

export function RouterProvider<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouteTree, TDehydrated>) {
  const options = {
    ...router.options,
    ...rest,
    meta: {
      ...router.options.meta,
      ...rest?.meta,
    },
  } as PickAsRequired<
    RouterOptions<TRouteTree, TDehydrated>,
    'stringifySearch' | 'parseSearch' | 'meta'
  >

  const history = React.useState(
    () => options.history ?? createBrowserHistory(),
  )[0]

  const tempLocationKeyRef = React.useRef<string | undefined>(
    `${Math.round(Math.random() * 10000000)}`,
  )
  const resetNextScrollRef = React.useRef<boolean>(false)

  const navigateTimeoutRef = React.useRef<NodeJS.Timeout | null>(null)

  const latestLoadPromiseRef = React.useRef<Promise<void>>(Promise.resolve())

  const checkLatest = (promise: Promise<void>): undefined | Promise<void> => {
    return latestLoadPromiseRef.current !== promise
      ? latestLoadPromiseRef.current
      : undefined
  }

  const parseLocation = useStableCallback(
    (
      previousLocation?: ParsedLocation,
    ): ParsedLocation<FullSearchSchema<TRouteTree>> => {
      const parse = ({
        pathname,
        search,
        hash,
        state,
      }: HistoryLocation): ParsedLocation<FullSearchSchema<TRouteTree>> => {
        const parsedSearch = options.parseSearch(search)

        return {
          pathname: pathname,
          searchStr: search,
          search: replaceEqualDeep(
            previousLocation?.search,
            parsedSearch,
          ) as any,
          hash: hash.split('#').reverse()[0] ?? '',
          href: `${pathname}${search}${hash}`,
          state: replaceEqualDeep(
            previousLocation?.state,
            state,
          ) as HistoryState,
        }
      }

      const location = parse(history.location)

      let { __tempLocation, __tempKey } = location.state

      if (
        __tempLocation &&
        (!__tempKey || __tempKey === tempLocationKeyRef.current)
      ) {
        // Sync up the location keys
        const parsedTempLocation = parse(__tempLocation) as any
        parsedTempLocation.state.key = location.state.key

        delete parsedTempLocation.state.__tempLocation

        return {
          ...parsedTempLocation,
          maskedLocation: location,
        }
      }

      return location
    },
  )

  const [state, setState] = React.useState<RouterState<TRouteTree>>(() =>
    getInitialRouterState(parseLocation()),
  )

  const basepath = `/${trimPath(options.basepath ?? '') ?? ''}`

  const resolvePathWithBase = useStableCallback(
    (from: string, path: string) => {
      return resolvePath(basepath!, from, cleanPath(path))
    },
  )

  const [routesById, routesByPath] = React.useMemo(() => {
    const routesById = {} as RoutesById<TRouteTree>
    const routesByPath = {} as RoutesByPath<TRouteTree>

    const recurseRoutes = (routes: AnyRoute[]) => {
      routes.forEach((route, i) => {
        route.init({ originalIndex: i })

        const existingRoute = (routesById as any)[route.id]

        invariant(
          !existingRoute,
          `Duplicate routes found with id: ${String(route.id)}`,
        )
        ;(routesById as any)[route.id] = route

        if (!route.isRoot && route.path) {
          const trimmedFullPath = trimPathRight(route.fullPath)
          if (
            !(routesByPath as any)[trimmedFullPath] ||
            route.fullPath.endsWith('/')
          ) {
            ;(routesByPath as any)[trimmedFullPath] = route
          }
        }

        const children = route.children as Route[]

        if (children?.length) {
          recurseRoutes(children)
        }
      })
    }

    recurseRoutes([router.routeTree])

    return [routesById, routesByPath] as const
  }, [])

  const looseRoutesById = routesById as Record<string, AnyRoute>

  const flatRoutes = React.useMemo(
    () =>
      (Object.values(routesByPath) as AnyRoute[])
        .map((d, i) => {
          const trimmed = trimPath(d.fullPath)
          const parsed = parsePathname(trimmed)

          while (parsed.length > 1 && parsed[0]?.value === '/') {
            parsed.shift()
          }

          const score = parsed.map((d) => {
            if (d.type === 'param') {
              return 0.5
            }

            if (d.type === 'wildcard') {
              return 0.25
            }

            return 1
          })

          return { child: d, trimmed, parsed, index: i, score }
        })
        .sort((a, b) => {
          let isIndex = a.trimmed === '/' ? 1 : b.trimmed === '/' ? -1 : 0

          if (isIndex !== 0) return isIndex

          const length = Math.min(a.score.length, b.score.length)

          // Sort by length of score
          if (a.score.length !== b.score.length) {
            return b.score.length - a.score.length
          }

          // Sort by min available score
          for (let i = 0; i < length; i++) {
            if (a.score[i] !== b.score[i]) {
              return b.score[i]! - a.score[i]!
            }
          }

          // Sort by min available parsed value
          for (let i = 0; i < length; i++) {
            if (a.parsed[i]!.value !== b.parsed[i]!.value) {
              return a.parsed[i]!.value! > b.parsed[i]!.value! ? 1 : -1
            }
          }

          // Sort by length of trimmed full path
          if (a.trimmed !== b.trimmed) {
            return a.trimmed > b.trimmed ? 1 : -1
          }

          // Sort by original index
          return a.index - b.index
        })
        .map((d, i) => {
          d.child.rank = i
          return d.child
        }),
    [routesByPath],
  )

  const matchRoutes = useStableCallback(
    <TRouteTree extends AnyRoute>(
      pathname: string,
      locationSearch: AnySearchSchema,
      opts?: { throwOnError?: boolean; debug?: boolean },
    ): RouteMatch<TRouteTree>[] => {
      let routeParams: AnyPathParams = {}

      let foundRoute = flatRoutes.find((route) => {
        const matchedParams = matchPathname(basepath, trimPathRight(pathname), {
          to: route.fullPath,
          caseSensitive: route.options.caseSensitive ?? options.caseSensitive,
          fuzzy: false,
        })

        if (matchedParams) {
          routeParams = matchedParams
          return true
        }

        return false
      })

      let routeCursor: AnyRoute = foundRoute || (routesById as any)['__root__']

      let matchedRoutes: AnyRoute[] = [routeCursor]
      // let includingLayouts = true
      while (routeCursor?.parentRoute) {
        routeCursor = routeCursor.parentRoute
        if (routeCursor) matchedRoutes.unshift(routeCursor)
      }

      // Existing matches are matches that are already loaded along with
      // pending matches that are still loading

      const parseErrors = matchedRoutes.map((route) => {
        let parsedParamsError

        if (route.options.parseParams) {
          try {
            const parsedParams = route.options.parseParams(routeParams)
            // Add the parsed params to the accumulated params bag
            Object.assign(routeParams, parsedParams)
          } catch (err: any) {
            parsedParamsError = new PathParamError(err.message, {
              cause: err,
            })

            if (opts?.throwOnError) {
              throw parsedParamsError
            }

            return parsedParamsError
          }
        }

        return
      })

      const matches = matchedRoutes.map((route, index) => {
        const interpolatedPath = interpolatePath(route.path, routeParams)
        const matchId = interpolatePath(route.id, routeParams, true)

        // Waste not, want not. If we already have a match for this route,
        // reuse it. This is important for layout routes, which might stick
        // around between navigation actions that only change leaf routes.
        const existingMatch = getRouteMatch(state, matchId)

        if (existingMatch) {
          return { ...existingMatch }
        }

        // Create a fresh route match
        const hasLoaders = !!(
          route.options.load ||
          componentTypes.some((d) => (route.options[d] as any)?.preload)
        )

        const routeMatch: AnyRouteMatch = {
          id: matchId,
          routeId: route.id,
          params: routeParams,
          pathname: joinPaths([basepath, interpolatedPath]),
          updatedAt: Date.now(),
          routeSearch: {},
          search: {} as any,
          status: hasLoaders ? 'pending' : 'success',
          isFetching: false,
          invalid: false,
          error: undefined,
          paramsError: parseErrors[index],
          searchError: undefined,
          loadPromise: Promise.resolve(),
          meta: undefined!,
          abortController: new AbortController(),
          fetchedAt: 0,
        }

        return routeMatch
      })

      // Take each match and resolve its search params and meta
      // This has to happen after the matches are created or found
      // so that we can use the parent match's search params and meta
      matches.forEach((match, i): any => {
        const parentMatch = matches[i - 1]
        const route = looseRoutesById[match.routeId]!

        const searchInfo = (() => {
          // Validate the search params and stabilize them
          const parentSearchInfo = {
            search: parentMatch?.search ?? locationSearch,
            routeSearch: parentMatch?.routeSearch ?? locationSearch,
          }

          try {
            const validator =
              typeof route.options.validateSearch === 'object'
                ? route.options.validateSearch.parse
                : route.options.validateSearch

            let routeSearch = validator?.(parentSearchInfo.search) ?? {}

            let search = {
              ...parentSearchInfo.search,
              ...routeSearch,
            }

            routeSearch = replaceEqualDeep(match.routeSearch, routeSearch)
            search = replaceEqualDeep(match.search, search)

            return {
              routeSearch,
              search,
              searchDidChange: match.routeSearch !== routeSearch,
            }
          } catch (err: any) {
            match.searchError = new SearchParamError(err.message, {
              cause: err,
            })

            if (opts?.throwOnError) {
              throw match.searchError
            }

            return parentSearchInfo
          }
        })()

        Object.assign(match, searchInfo)
      })

      return matches as any
    },
  )

  const cancelMatch = useStableCallback(
    <TRouteTree extends AnyRoute>(id: string) => {
      getRouteMatch(state, id)?.abortController?.abort()
    },
  )

  const cancelMatches = useStableCallback(
    <TRouteTree extends AnyRoute>(state: RouterState<TRouteTree>) => {
      state.matches.forEach((match) => {
        cancelMatch(match.id)
      })
    },
  )

  const buildLocation = useStableCallback(
    <TRouteTree extends AnyRoute>(
      opts: BuildNextOptions = {},
    ): ParsedLocation => {
      const build = (
        dest: BuildNextOptions & {
          unmaskOnReload?: boolean
        } = {},
        matches?: AnyRouteMatch[],
      ): ParsedLocation => {
        const from = latestLocationRef.current
        const fromPathname = dest.from ?? from.pathname

        let pathname = resolvePathWithBase(fromPathname, `${dest.to ?? ''}`)

        const fromMatches = matchRoutes(fromPathname, from.search)
        const stayingMatches = matches?.filter((d) =>
          fromMatches?.find((e) => e.routeId === d.routeId),
        )

        const prevParams = { ...last(fromMatches)?.params }

        let nextParams =
          (dest.params ?? true) === true
            ? prevParams
            : functionalUpdate(dest.params!, prevParams)

        if (nextParams) {
          matches
            ?.map((d) => looseRoutesById[d.routeId]!.options.stringifyParams)
            .filter(Boolean)
            .forEach((fn) => {
              nextParams = { ...nextParams!, ...fn!(nextParams!) }
            })
        }

        pathname = interpolatePath(pathname, nextParams ?? {})

        const preSearchFilters =
          stayingMatches
            ?.map(
              (match) =>
                looseRoutesById[match.routeId]!.options.preSearchFilters ?? [],
            )
            .flat()
            .filter(Boolean) ?? []

        const postSearchFilters =
          stayingMatches
            ?.map(
              (match) =>
                looseRoutesById[match.routeId]!.options.postSearchFilters ?? [],
            )
            .flat()
            .filter(Boolean) ?? []

        // Pre filters first
        const preFilteredSearch = preSearchFilters?.length
          ? preSearchFilters?.reduce(
              (prev, next) => next(prev) as any,
              from.search,
            )
          : from.search

        // Then the link/navigate function
        const destSearch =
          dest.search === true
            ? preFilteredSearch // Preserve resolvedFrom true
            : dest.search
            ? functionalUpdate(dest.search, preFilteredSearch) ?? {} // Updater
            : preSearchFilters?.length
            ? preFilteredSearch // Preserve resolvedFrom filters
            : {}

        // Then post filters
        const postFilteredSearch = postSearchFilters?.length
          ? postSearchFilters.reduce((prev, next) => next(prev), destSearch)
          : destSearch

        const search = replaceEqualDeep(from.search, postFilteredSearch)

        const searchStr = options.stringifySearch(search)

        const hash =
          dest.hash === true
            ? from.hash
            : dest.hash
            ? functionalUpdate(dest.hash!, from.hash)
            : from.hash

        const hashStr = hash ? `#${hash}` : ''

        let nextState =
          dest.state === true
            ? from.state
            : dest.state
            ? functionalUpdate(dest.state, from.state)
            : from.state

        nextState = replaceEqualDeep(from.state, nextState)

        return {
          pathname,
          search,
          searchStr,
          state: nextState as any,
          hash,
          href: history.createHref(`${pathname}${searchStr}${hashStr}`),
          unmaskOnReload: dest.unmaskOnReload,
        }
      }

      const buildWithMatches = (
        dest: BuildNextOptions = {},
        maskedDest?: BuildNextOptions,
      ) => {
        let next = build(dest)
        let maskedNext = maskedDest ? build(maskedDest) : undefined

        if (!maskedNext) {
          let params = {}

          let foundMask = options.routeMasks?.find((d) => {
            const match = matchPathname(basepath, next.pathname, {
              to: d.from,
              caseSensitive: false,
              fuzzy: false,
            })

            if (match) {
              params = match
              return true
            }

            return false
          })

          if (foundMask) {
            foundMask = {
              ...foundMask,
              from: interpolatePath(foundMask.from, params) as any,
            }
            maskedDest = foundMask
            maskedNext = build(maskedDest)
          }
        }

        const nextMatches = matchRoutes(next.pathname, next.search)
        const maskedMatches = maskedNext
          ? matchRoutes(maskedNext.pathname, maskedNext.search)
          : undefined
        const maskedFinal = maskedNext
          ? build(maskedDest, maskedMatches)
          : undefined

        const final = build(dest, nextMatches)

        if (maskedFinal) {
          final.maskedLocation = maskedFinal
        }

        return final
      }

      if (opts.mask) {
        return buildWithMatches(opts, {
          ...pick(opts, ['from']),
          ...opts.mask,
        })
      }

      return buildWithMatches(opts)
    },
  )

  const commitLocation = useStableCallback(
    async (next: ParsedLocation & CommitLocationOptions) => {
      if (navigateTimeoutRef.current) clearTimeout(navigateTimeoutRef.current)

      const isSameUrl = latestLocationRef.current.href === next.href

      // If the next urls are the same and we're not replacing,
      // do nothing
      if (!isSameUrl || !next.replace) {
        let { maskedLocation, ...nextHistory } = next

        if (maskedLocation) {
          nextHistory = {
            ...maskedLocation,
            state: {
              ...maskedLocation.state,
              __tempKey: undefined,
              __tempLocation: {
                ...nextHistory,
                search: nextHistory.searchStr,
                state: {
                  ...nextHistory.state,
                  __tempKey: undefined!,
                  __tempLocation: undefined!,
                  key: undefined!,
                },
              },
            },
          }

          if (nextHistory.unmaskOnReload ?? options.unmaskOnReload ?? false) {
            nextHistory.state.__tempKey = tempLocationKeyRef.current
          }
        }

        history[next.replace ? 'replace' : 'push'](
          nextHistory.href,
          nextHistory.state,
        )
      }

      resetNextScrollRef.current = next.resetScroll ?? true

      return latestLoadPromiseRef.current
    },
  )

  const buildAndCommitLocation = useStableCallback(
    ({
      replace,
      resetScroll,
      ...rest
    }: BuildNextOptions & CommitLocationOptions = {}) => {
      const location = buildLocation(rest)
      return commitLocation({
        ...location,
        replace,
        resetScroll,
      })
    },
  )

  const navigate = useStableCallback<NavigateFn<TRouteTree>>(
    ({ from, to = '', ...rest }) => {
      // If this link simply reloads the current route,
      // make sure it has a new key so it will trigger a data refresh

      // If this `to` is a valid external URL, return
      // null for LinkUtils
      const toString = String(to)
      const fromString = typeof from === 'undefined' ? from : String(from)
      let isExternal

      try {
        new URL(`${toString}`)
        isExternal = true
      } catch (e) {}

      invariant(
        !isExternal,
        'Attempting to navigate to external url with this.navigate!',
      )

      return buildAndCommitLocation({
        ...rest,
        from: fromString,
        to: toString,
      })
    },
  )

  const loadMatches = useStableCallback(
    async ({
      checkLatest,
      matches,
      preload,
    }: {
      checkLatest: () => Promise<void> | undefined
      matches: AnyRouteMatch[]
      preload?: boolean
    }): Promise<RouteMatch[]> => {
      let latestPromise
      let firstBadMatchIndex: number | undefined

      // Check each match middleware to see if the route can be accessed
      try {
        for (let [index, match] of matches.entries()) {
          const parentMatch = matches[index - 1]
          const route = looseRoutesById[match.routeId]!

          const handleError = (err: any, code: string) => {
            err.routerCode = code
            firstBadMatchIndex = firstBadMatchIndex ?? index

            if (isRedirect(err)) {
              throw err
            }

            try {
              route.options.onError?.(err)
            } catch (errorHandlerErr) {
              err = errorHandlerErr

              if (isRedirect(errorHandlerErr)) {
                throw errorHandlerErr
              }
            }

            matches[index] = match = {
              ...match,
              error: err,
              status: 'error',
              updatedAt: Date.now(),
            }
          }

          try {
            if (match.paramsError) {
              handleError(match.paramsError, 'PARSE_PARAMS')
            }

            if (match.searchError) {
              handleError(match.searchError, 'VALIDATE_SEARCH')
            }

            const parentMeta = parentMatch?.meta ?? options.meta ?? {}

            const beforeLoadMeta =
              (await route.options.beforeLoad?.({
                search: match.search,
                abortController: match.abortController,
                params: match.params,
                preload: !!preload,
                meta: parentMeta,
                location: state.location, // TODO: This might need to be latestLocationRef.current...?
                navigate: (opts) => navigate({ ...opts, from: match.pathname }),
              })) ?? ({} as any)

            const meta = {
              ...parentMeta,
              ...beforeLoadMeta,
            }

            matches[index] = match = {
              ...match,
              meta: replaceEqualDeep(match.meta, meta),
            }
          } catch (err) {
            handleError(err, 'BEFORE_LOAD')
            break
          }
        }
      } catch (err) {
        if (isRedirect(err)) {
          if (!preload) navigate(err as any)
          return matches
        }

        throw err
      }

      const validResolvedMatches = matches.slice(0, firstBadMatchIndex)
      const matchPromises: Promise<any>[] = []

      validResolvedMatches.forEach((match, index) => {
        matchPromises.push(
          (async () => {
            const parentMatchPromise = matchPromises[index - 1]
            const route = looseRoutesById[match.routeId]!

            if (match.isFetching) {
              return getRouteMatch(state, match.id)?.loadPromise
            }

            const handleIfRedirect = (err: any) => {
              if (isRedirect(err)) {
                if (!preload) {
                  navigate(err as any)
                }
                return true
              }
              return false
            }

            const load = async () => {
              try {
                const componentsPromise = Promise.all(
                  componentTypes.map(async (type) => {
                    const component = route.options[type]

                    if ((component as any)?.preload) {
                      await (component as any).preload()
                    }
                  }),
                )

                const loaderPromise = route.options.load?.({
                  params: match.params,
                  search: match.search,
                  preload: !!preload,
                  parentMatchPromise,
                  abortController: match.abortController,
                  meta: match.meta,
                  location: state.location,
                  navigate: (opts) =>
                    navigate({ ...opts, from: match.pathname }),
                })

                await Promise.all([componentsPromise, loaderPromise])
                if ((latestPromise = checkLatest())) return await latestPromise

                matches[index] = match = {
                  ...match,
                  error: undefined,
                  status: 'success',
                  isFetching: false,
                  updatedAt: Date.now(),
                }
              } catch (error) {
                if ((latestPromise = checkLatest())) return await latestPromise
                if (handleIfRedirect(error)) return

                try {
                  route.options.onError?.(error)
                } catch (onErrorError) {
                  error = onErrorError
                  if (handleIfRedirect(onErrorError)) return
                }

                matches[index] = match = {
                  ...match,
                  error,
                  status: 'error',
                  isFetching: false,
                  updatedAt: Date.now(),
                }
              }

              if (!preload) {
                setState((s) => ({
                  ...s,
                  matches: s.matches.map((d) =>
                    d.id === match.id ? match : d,
                  ),
                }))
              }
            }

            let loadPromise: Promise<void> | undefined

            matches[index] = match = {
              ...match,
              isFetching: true,
              fetchedAt: Date.now(),
              invalid: false,
            }

            loadPromise = load()

            matches[index] = match = {
              ...match,
              loadPromise,
            }

            await loadPromise
          })(),
        )
      })

      await Promise.all(matchPromises)
      return matches
    },
  )

  const load = useStableCallback<LoadFn>(async () => {
    const promise = new Promise<void>(async (resolve, reject) => {
      const next = latestLocationRef.current
      const prevLocation = state.resolvedLocation
      const pathDidChange = !!(next && prevLocation!.href !== next.href)
      let latestPromise: Promise<void> | undefined | null

      // Cancel any pending matches
      cancelMatches(state)

      router.emit({
        type: 'onBeforeLoad',
        from: prevLocation,
        to: next ?? state.location,
        pathChanged: pathDidChange,
      })

      // Ingest the new location
      setState((s) => ({
        ...s,
        location: next,
      }))

      // Match the routes
      let matches: RouteMatch<any, any>[] = matchRoutes(
        next.pathname,
        next.search,
        {
          debug: true,
        },
      )

      setState((s) => ({
        ...s,
        status: 'pending',
        matches,
      }))

      try {
        try {
          // Load the matches
          await loadMatches({
            matches,
            checkLatest: () => checkLatest(promise),
          })
        } catch (err) {
          // swallow this error, since we'll display the
          // errors on the route components
        }

        // Only apply the latest transition
        if ((latestPromise = checkLatest(promise))) {
          return latestPromise
        }

        // TODO:
        // const exitingMatchIds = previousMatches.filter(
        //   (id) => !state.pendingMatches.includes(id),
        // )
        // const enteringMatchIds = state.pendingMatches.filter(
        //   (id) => !previousMatches.includes(id),
        // )
        // const stayingMatchIds = previousMatches.filter((id) =>
        //   state.pendingMatches.includes(id),
        // )

        setState((s) => ({
          ...s,
          status: 'idle',
          resolvedLocation: s.location,
        }))

        // TODO:
        // ;(
        //   [
        //     [exitingMatchIds, 'onLeave'],
        //     [enteringMatchIds, 'onEnter'],
        //     [stayingMatchIds, 'onTransition'],
        //   ] as const
        // ).forEach(([matches, hook]) => {
        //   matches.forEach((match) => {
        //     const route = this.getRoute(match.routeId)
        //     route.options[hook]?.(match)
        //   })
        // })
        router.emit({
          type: 'onLoad',
          from: prevLocation,
          to: next,
          pathChanged: pathDidChange,
        })

        resolve()
      } catch (err) {
        // Only apply the latest transition
        if ((latestPromise = checkLatest(promise))) {
          return latestPromise
        }

        reject(err)
      }
    })

    latestLoadPromiseRef.current = promise

    return latestLoadPromiseRef.current
  })

  const preloadRoute = useStableCallback(
    async (navigateOpts: BuildNextOptions = state.location) => {
      let next = buildLocation(navigateOpts)

      let matches = matchRoutes(next.pathname, next.search, {
        throwOnError: true,
      })

      await loadMatches({
        matches,
        preload: true,
        checkLatest: () => undefined,
      })

      return [last(matches)!, matches] as const
    },
  )

  const buildLink = useStableCallback<BuildLinkFn<TRouteTree>>(
    (state, dest) => {
      // If this link simply reloads the current route,
      // make sure it has a new key so it will trigger a data refresh

      // If this `to` is a valid external URL, return
      // null for LinkUtils

      const {
        to,
        preload: userPreload,
        preloadDelay: userPreloadDelay,
        activeOptions,
        disabled,
        target,
        replace,
        resetScroll,
      } = dest

      try {
        new URL(`${to}`)
        return {
          type: 'external',
          href: to as any,
        }
      } catch (e) {}

      const nextOpts = dest

      const next = buildLocation(nextOpts as any)

      const preload = userPreload ?? options.defaultPreload
      const preloadDelay = userPreloadDelay ?? options.defaultPreloadDelay ?? 0

      // Compare path/hash for matches
      const currentPathSplit = latestLocationRef.current.pathname.split('/')
      const nextPathSplit = next.pathname.split('/')
      const pathIsFuzzyEqual = nextPathSplit.every(
        (d, i) => d === currentPathSplit[i],
      )
      // Combine the matches based on user options
      const pathTest = activeOptions?.exact
        ? latestLocationRef.current.pathname === next.pathname
        : pathIsFuzzyEqual
      const hashTest = activeOptions?.includeHash
        ? latestLocationRef.current.hash === next.hash
        : true
      const searchTest =
        activeOptions?.includeSearch ?? true
          ? partialDeepEqual(latestLocationRef.current.search, next.search)
          : true

      // The final "active" test
      const isActive = pathTest && hashTest && searchTest

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
          commitLocation({ ...next, replace, resetScroll })
        }
      }

      // The click handler
      const handleFocus = (e: MouseEvent) => {
        if (preload) {
          preloadRoute(nextOpts as any).catch((err) => {
            console.warn(err)
            console.warn(preloadWarning)
          })
        }
      }

      const handleTouchStart = (e: TouchEvent) => {
        preloadRoute(nextOpts as any).catch((err) => {
          console.warn(err)
          console.warn(preloadWarning)
        })
      }

      const handleEnter = (e: MouseEvent) => {
        const target = (e.target || {}) as LinkCurrentTargetElement

        if (preload) {
          if (target.preloadTimeout) {
            return
          }

          target.preloadTimeout = setTimeout(() => {
            target.preloadTimeout = null
            preloadRoute(nextOpts as any).catch((err) => {
              console.warn(err)
              console.warn(preloadWarning)
            })
          }, preloadDelay)
        }
      }

      const handleLeave = (e: MouseEvent) => {
        const target = (e.target || {}) as LinkCurrentTargetElement

        if (target.preloadTimeout) {
          clearTimeout(target.preloadTimeout)
          target.preloadTimeout = null
        }
      }

      return {
        type: 'internal',
        next,
        handleFocus,
        handleClick,
        handleEnter,
        handleLeave,
        handleTouchStart,
        isActive,
        disabled,
      }
    },
  )

  const latestLocationRef = React.useRef(state.location)

  React.useLayoutEffect(() => {
    const unsub = history.subscribe(() => {
      latestLocationRef.current = parseLocation(latestLocationRef.current)

      React.startTransition(() => {
        if (state.location !== latestLocationRef.current) {
          try {
            load()
          } catch (err) {
            console.error(err)
          }
        }
      })
    })

    const nextLocation = buildLocation({
      search: true,
      params: true,
      hash: true,
      state: true,
    })

    if (state.location.href !== nextLocation.href) {
      commitLocation({ ...nextLocation, replace: true })
    }

    return () => {
      unsub()
    }
  }, [history])

  const initialLoad = React.useRef(true)

  if (initialLoad.current) {
    initialLoad.current = false
    try {
      load()
    } catch (err) {
      console.error(err)
    }
  }

  const isFetching = React.useMemo(
    () => [...state.matches, ...state.pendingMatches].some((d) => d.isFetching),
    [state.matches, state.pendingMatches],
  )

  const matchRoute = useStableCallback((state, location, opts) => {
    location = {
      ...location,
      to: location.to
        ? resolvePathWithBase((location.from || '') as string, location.to)
        : undefined,
    } as any

    const next = buildLocation(location as any)
    if (opts?.pending && state.status !== 'pending') {
      return false
    }

    const baseLocation = opts?.pending
      ? latestLocationRef.current
      : state.resolvedLocation

    if (!baseLocation) {
      return false
    }

    const match = matchPathname(basepath, baseLocation.pathname, {
      ...opts,
      to: next.pathname,
    }) as any

    if (!match) {
      return false
    }

    if (opts?.includeSearch ?? true) {
      return partialDeepEqual(baseLocation.search, next.search) ? match : false
    }

    return match
  })

  const routerContextValue: RouterContext<TRouteTree> = {
    routeTree: router.routeTree,
    navigate,
    buildLink,
    state,
    matchRoute,
    routesById,
    options,
    history,
    load,
  }

  return (
    <routerContext.Provider value={routerContextValue}>
      <Matches />
    </routerContext.Provider>
  )
}

function mergeMatches<TRouteTree extends AnyRoute>(
  prevMatchesById: Record<string, RouteMatch<TRouteTree>>,
  nextMatches: AnyRouteMatch[],
): Record<string, RouteMatch<TRouteTree>> {
  let matchesById = { ...prevMatchesById }

  nextMatches.forEach((match) => {
    if (!matchesById[match.id]) {
      matchesById[match.id] = match
    }

    matchesById[match.id] = {
      ...matchesById[match.id],
      ...match,
    }
  })

  return matchesById
}

function isCtrlEvent(e: MouseEvent) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}
export class SearchParamError extends Error {}
export class PathParamError extends Error {}

export function getRouteMatch<TRouteTree extends AnyRoute>(
  state: RouterState<TRouteTree>,
  id: string,
): undefined | RouteMatch<TRouteTree> {
  return [...state.pendingMatches, ...state.matches].find((d) => d.id === id)
}
