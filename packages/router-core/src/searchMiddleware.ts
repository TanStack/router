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
        if (
          typeof value === 'object' &&
          value !== null &&
          Object.keys(value).length === 0
        )
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

const searchPersistenceStore = new SearchPersistenceStore()

// Get the properly typed store instance
export function getSearchPersistenceStore<
  TRouteTree extends AnyRoute = RegisteredRouter['routeTree'],
>(): {
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
      return searchPersistenceStore.getTypedState<TRouteTree>()
    },
    get store() {
      return searchPersistenceStore.getTypedStore<TRouteTree>()
    },
    subscribe: (listener: () => void) =>
      searchPersistenceStore.subscribe(listener),
    getSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
    ) => searchPersistenceStore.getSearch<TRouteTree, TRouteId>(routeId),
    saveSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
      search: RouteById<TRouteTree, TRouteId>['types']['fullSearchSchema'],
    ) =>
      searchPersistenceStore.saveSearch<TRouteTree, TRouteId>(routeId, search),
    clearSearch: <TRouteId extends keyof RoutesById<TRouteTree>>(
      routeId: TRouteId,
    ) => searchPersistenceStore.clearSearch<TRouteTree, TRouteId>(routeId),
    clearAllSearches: () => searchPersistenceStore.clearAllSearches(),
  }
}

export function persistSearchParams<TSearchSchema>(
  persistedSearchParams: Array<keyof TSearchSchema>,
  exclude?: Array<keyof TSearchSchema>,
): SearchMiddleware<TSearchSchema> {
  return ({ search, next, route }) => {
    // Filter input to only explicitly allowed keys for this route
    const searchRecord = search as Record<string, unknown>
    const allowedKeysStr = persistedSearchParams.map((key) => String(key))
    const filteredSearch = Object.fromEntries(
      Object.entries(searchRecord).filter(([key]) =>
        allowedKeysStr.includes(key),
      ),
    ) as TSearchSchema

    // Restore from store if current search is empty
    const savedSearch = searchPersistenceStore.getSearch(route.id)
    let searchToProcess = filteredSearch

    if (savedSearch && Object.keys(savedSearch).length > 0) {
      const currentSearch = filteredSearch as Record<string, unknown>
      const isEmpty = Object.keys(currentSearch).length === 0

      if (isEmpty) {
        searchToProcess = savedSearch as TSearchSchema
      }
    }

    const result = next(searchToProcess)

    // Save only the allowed parameters for persistence
    const resultRecord = result as Record<string, unknown>
    if (Object.keys(resultRecord).length > 0) {
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
        searchPersistenceStore.saveSearch(route.id, filteredResult)
      }
    }

    return result
  }
}
