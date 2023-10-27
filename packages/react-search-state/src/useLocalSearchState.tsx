const LocalStorage = (() => {
  let storage: Record<string, string> = {}

  if (typeof document !== 'undefined') {
    storage = window.localStorage
  }

  return {
    set: <T,>(key: string, value: T) => {
      storage[key] = JSON.stringify(value)
      return value
    },
    get: <T,>(key: string, defaultValue?: T): T => {
      try {
        return JSON.parse(storage[key]!) as T
      } catch (e) {
        return defaultValue as T
      }
    },
  }
})()

export const useLocalDefaultValue =
  <TSearch, TKey extends keyof TSearch, TState extends TSearch[TKey]>(
    useDefaultValue: (ctx: {
      search: TSearch
      key: string
      deps: any[]
    }) => TState,
  ) =>
  (ctx: { search: TSearch; key: string; deps: any[] }): TState => {
    const defaultValue = useDefaultValue(ctx)

    // Get the cached last value
    const key = `searchState:${JSON.stringify(ctx.key)}:${JSON.stringify(
      ctx.deps,
    )}`
    const cached = LocalStorage.get(key)

    if (cached) {
      return cached as TState
    }

    return defaultValue as TState
  }

export const localPersister =
  () => (ctx: { state: any; key: string; deps: any[] }) => {
    const key = `searchState:${JSON.stringify(ctx.key)}:${JSON.stringify(
      ctx.deps,
    )}`

    LocalStorage.set(key, ctx.state)
  }
