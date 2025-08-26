import { Store } from '@tanstack/store'
import { deepEqual, replaceEqualDeep } from './utils'
import type { NoInfer, PickOptional } from './utils'
import type { AnyRoute, SearchMiddleware } from './route'
import type { IsRequiredParams } from './link'
import type { RouteById, RoutesById } from './routeInfo'
import type { RegisteredRouter } from './router'

export function retainSearchParams<TSearchSchema extends object>(
  keys: Array<keyof TSearchSchema> | true,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    const result = next(search)
    if (keys === true) {
      return { ...search, ...result }
    }
    // add missing keys from search to result
    keys.forEach((key) => {
      if (!(key in result)) {
        result[key] = search[key]
      }
    })
    return result
  }
}

export function stripSearchParams<
  TSearchSchema,
  TOptionalProps = PickOptional<NoInfer<TSearchSchema>>,
  const TValues =
    | Partial<NoInfer<TOptionalProps>>
    | Array<keyof TOptionalProps>,
  const TInput = IsRequiredParams<TSearchSchema> extends never
    ? TValues | true
    : TValues,
>(input: NoInfer<TInput>): SearchMiddleware<TSearchSchema> {
  return ({ search, next }) => {
    if (input === true) {
      return {} as TSearchSchema
    }
    const result = next(search) as Record<string, unknown>
    if (Array.isArray(input)) {
      input.forEach((key) => {
        delete result[key]
      })
    } else {
      Object.entries(input as Record<string, unknown>).forEach(
        ([key, value]) => {
          if (deepEqual(result[key], value)) {
            delete result[key]
          }
        },
      )
    }
    return result as TSearchSchema
  }
}

export class SearchPersistenceStore {
  private __store: Store<Record<string, Record<string, unknown>>>

  constructor() {
    this.__store = new Store({})
  }

  get state() {
    return this.__store.state
  }

  subscribe(listener: () => void) {
    return this.__store.subscribe(listener)
  }

  get store() {
    return this.__store
  }

  getTypedStore<
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  >(): Store<{
    [K in keyof RoutesById<TRouteTree>]: RouteById<
      TRouteTree,
      K
    >['types']['fullSearchSchema']
  }> {
    return this.__store as Store<{
      [K in keyof RoutesById<TRouteTree>]: RouteById<
        TRouteTree,
        K
      >['types']['fullSearchSchema']
    }>
  }

  getTypedState<
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
  >(): {
    [K in keyof RoutesById<TRouteTree>]: RouteById<
      TRouteTree,
      K
    >['types']['fullSearchSchema']
  } {
    return this.__store.state as {
      [K in keyof RoutesById<TRouteTree>]: RouteById<
        TRouteTree,
        K
      >['types']['fullSearchSchema']
    }
  }

  saveSearch<
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TRouteId extends
      keyof RoutesById<TRouteTree> = keyof RoutesById<TRouteTree>,
  >(
    routeId: TRouteId,
    search: RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
  ): void {
    const searchRecord = search as Record<string, unknown>
    const cleanedSearch = Object.fromEntries(
      Object.entries(searchRecord).filter(([_, value]) => {
        if (value === null || value === undefined || value === '') return false
        if (Array.isArray(value) && value.length === 0) return false
        if (typeof value === 'object' && Object.keys(value).length === 0)
          return false
        return true
      }),
    )

    this.__store.setState((prevState) => {
      return Object.keys(cleanedSearch).length === 0
        ? (() => {
            const { [routeId]: _, ...rest } = prevState
            return rest
          })()
        : replaceEqualDeep(prevState, {
            ...prevState,
            [routeId]: cleanedSearch,
          })
    })
  }

  getSearch<
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TRouteId extends
      keyof RoutesById<TRouteTree> = keyof RoutesById<TRouteTree>,
  >(
    routeId: TRouteId,
  ): RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'] | null {
    return (
      (this.state[routeId as string] as RouteById<
        TRouteTree,
        TRouteId
      >['types']['fullSearchSchema']) || null
    )
  }

  clearSearch<
    TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
    TRouteId extends
      keyof RoutesById<TRouteTree> = keyof RoutesById<TRouteTree>,
  >(routeId: TRouteId): void {
    this.__store.setState((prevState) => {
      const { [routeId as string]: _, ...rest } = prevState
      return rest
    })
  }

  clearAllSearches(): void {
    this.__store.setState(() => ({}))
  }
}

// Factory function to create a new SearchPersistenceStore instance
export function createSearchPersistenceStore(): SearchPersistenceStore {
  return new SearchPersistenceStore()
}

// Get a typed interface for an existing SearchPersistenceStore instance
export function getSearchPersistenceStore<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(
  store: SearchPersistenceStore,
): {
  state: {
    [K in keyof RoutesById<TRouteTree>]: RouteById<
      TRouteTree,
      K
    >['types']['fullSearchSchema']
  }
  store: Store<{
    [K in keyof RoutesById<TRouteTree>]: RouteById<
      TRouteTree,
      K
    >['types']['fullSearchSchema']
  }>
  subscribe: (listener: () => void) => () => void
  getSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
    routeId: TRouteId,
  ) => RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'] | null
  saveSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
    routeId: TRouteId,
    search: RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
  ) => void
  clearSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
    routeId: TRouteId,
  ) => void
  clearAllSearches: () => void
} {
  return {
    get state() {
      return store.getTypedState<TRouteTree>()
    },
    get store() {
      return store.getTypedStore<TRouteTree>()
    },
    subscribe: (listener: () => void) => store.subscribe(listener),
    getSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
    ) => store.getSearch<TRouteTree, TRouteId>(routeId),
    saveSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
      search: RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
    ) => store.saveSearch<TRouteTree, TRouteId>(routeId, search),
    clearSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
    ) => store.clearSearch<TRouteTree, TRouteId>(routeId),
    clearAllSearches: () => store.clearAllSearches(),
  }
}

export function persistSearchParams<TSearchSchema>(
  persistedSearchParams: Array<keyof TSearchSchema>,
  exclude?: Array<keyof TSearchSchema>,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next, route, router }) => {
    const store = router.options.searchPersistenceStore as
      | SearchPersistenceStore
      | undefined

    if (!store) {
      return next(search)
    }

    const searchRecord = search as Record<string, unknown>
    const allowedKeysStr = persistedSearchParams.map((key) => String(key))
    const filteredSearch = Object.fromEntries(
      Object.entries(searchRecord).filter(([key]) =>
        allowedKeysStr.includes(key),
      ),
    ) as TSearchSchema

    const savedSearch = store.getSearch(route.id)
    const searchToProcess = filteredSearch

    if (savedSearch && Object.keys(savedSearch).length > 0) {
      const currentSearch = filteredSearch as Record<string, unknown>
      const isEmpty = Object.keys(currentSearch).length === 0

      if (isEmpty) {
        // Skip router validation for restored data since we know it's valid
        // This prevents Zod .catch() defaults from overriding our restored values
        const result = savedSearch as TSearchSchema

        const resultRecord = result as Record<string, unknown>
        const persistedKeysStr = persistedSearchParams.map((key) => String(key))
        const paramsToSave = Object.fromEntries(
          Object.entries(resultRecord).filter(([key]) =>
            persistedKeysStr.includes(key),
          ),
        )

        const excludeKeys = exclude ? exclude.map((key) => String(key)) : []
        const filteredResult = Object.fromEntries(
          Object.entries(paramsToSave).filter(
            ([key]) => !excludeKeys.includes(key),
          ),
        )

        if (Object.keys(filteredResult).length > 0) {
          store.saveSearch(route.id, filteredResult)
        }

        return result
      }
    }

    const result = next(searchToProcess)

    // Save only the allowed parameters for persistence
    const resultRecord = result as Record<string, unknown>
    const persistedKeysStr = persistedSearchParams.map((key) => String(key))
    const paramsToSave = Object.fromEntries(
      Object.entries(resultRecord).filter(([key]) =>
        persistedKeysStr.includes(key),
      ),
    )

    const excludeKeys = exclude ? exclude.map((key) => String(key)) : []
    const filteredResult = Object.fromEntries(
      Object.entries(paramsToSave).filter(
        ([key]) => !excludeKeys.includes(key),
      ),
    )

    // Only save if we have actual search params to persist
    // Don't save empty objects as they overwrite existing data
    if (Object.keys(filteredResult).length > 0) {
      store.saveSearch(route.id, filteredResult)
    }

    return result
  }
}
