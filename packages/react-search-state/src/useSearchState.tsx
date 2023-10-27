import * as React from 'react'
import {
  RouterHistory,
  defaultParseSearch,
  defaultStringifySearch,
} from '@tanstack/router-core'
export interface SearchParams {}

type AnySearch = Record<string, any>
export type NoInfer<T> = [T][T extends any ? 0 : never]

let ourHistory: RouterHistory

export function configureSearchState({ history }: { history: RouterHistory }) {
  ourHistory = history
}

const leaderByPath: Record<
  string,
  {
    leaderId?: string
    subscribers: Set<() => void>
  }
> = {}

export type UseSearchStateOptions<
  TSearch extends AnySearch,
  TKey extends keyof TSearch,
  TState = TSearch[TKey],
> = {
  key: TKey
  useDefaultValue?: (ctx: {
    search: SearchParams
    key: string
    deps: any[]
  }) => NoInfer<TState>
  useDeps?: (search: SearchParams) => any[]
  usePersister?: () => (ctx: {
    state: NoInfer<TState>
    key: string
    deps: any[]
  }) => void
  useIsInvalid?: (value: TState) => any
  useTransform?: (value: TState) => NoInfer<TState>
  writeDefault?: boolean
  defaultReplace?: boolean
}

export type UseSearchStateResult<TState = any> = {
  state: TState
  setState: (
    searchUpdater: Updater<TState>,
    opts?: { replace?: boolean },
  ) => void
  reset: (opts?: { replace?: boolean }) => void
  createHref: (searchUpdater: Updater<TState>) => string
  isDirty: boolean
}

export type UpdaterFn<T> = (prev: T) => T

export type Updater<T> = UpdaterFn<T> | T

const decodeSearch = () => defaultParseSearch(ourHistory.location.search)

let stableSearch: SearchParams

export const getSearch = () => {
  if (!stableSearch) {
    stableSearch = decodeSearch()
    ourHistory.subscribe(() => {
      stableSearch = replaceEqualDeep(stableSearch || {}, decodeSearch())
    })
  }

  return stableSearch
}

export const createUrl = (search: Updater<SearchParams>) => {
  const pathname = ourHistory.location.pathname
  const hash = ourHistory.location.hash
  const searchString = defaultStringifySearch(
    functionalUpdate(search, getSearch()),
  )
  return `${pathname}${searchString}${hash ? `#${hash}` : ''}`
}

export const navigate = ({
  search,
  replace,
  state,
}: {
  search: Updater<SearchParams>
  replace?: boolean
  state: any
}) => {
  const url = createUrl(search)

  if (replace) {
    ourHistory.replace(url, history.state)
  } else {
    ourHistory.push(url, state)
  }
}

export function useSearchState<
  TKey extends keyof SearchParams,
  TState = SearchParams[TKey],
>({
  key,
  useDefaultValue,
  useDeps,
  usePersister,
  useIsInvalid,
  useTransform,
  writeDefault,
  defaultReplace,
}: UseSearchStateOptions<SearchParams, TKey>): UseSearchStateResult<TState> {
  const uidRef = React.useRef(`${Math.random()}`)
  const serializedPath = JSON.stringify(key)

  let entry = leaderByPath[serializedPath]!

  if (!entry) {
    entry = leaderByPath[serializedPath] = {
      leaderId: uidRef.current,
      subscribers: new Set(),
    }
  }

  const leaderId = entry.leaderId

  const [search, setSearch] = React.useState(() => getSearch())
  const latestSearch = useGetLatest(search)

  React.useEffect(() => {
    if (!leaderId) {
      entry.leaderId = uidRef.current
    }

    const unsub = ourHistory.subscribe(() => {
      if (latestSearch() !== stableSearch) {
        setSearch(stableSearch as any)
      }
    })

    return () => {
      unsub()
    }
  }, [uidRef, leaderId])

  const isLeader = leaderByPath[serializedPath]?.leaderId === uidRef.current

  const deps = useDeps?.(search) || []
  const serializedDeps = JSON.stringify(deps)

  const defaultValue = useDefaultValue?.({ search, key, deps }) as TState
  const originalValue = search[key] as any
  let state = React.useMemo(
    () => (originalValue === undefined ? defaultValue : originalValue),
    [defaultValue, originalValue],
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (useTransform) state = useTransform(state)

  const isDirty = React.useMemo(
    () => !deepEqual(state, defaultValue),
    [defaultValue, state],
  )

  const setState = React.useCallback(
    (
      updater: Updater<TState>,
      opts?: {
        replace?: boolean
        state?: Record<string, any>
      },
    ) => {
      const res = navigate({
        search: (prev) => ({
          ...prev,
          [key]: functionalUpdate(updater, prev[key]),
        }),
        replace: opts?.replace ?? defaultReplace,
        state: opts?.state,
      })

      return res
    },
    [navigate],
  )

  // Create a link to the value
  const createHref = React.useCallback((searchUpdater: Updater<TState>) => {
    return createUrl((prev) => ({
      ...prev,
      [key]: functionalUpdate(searchUpdater, prev[key]),
    }))
  }, [])

  // If the value is undefined and we have a default value, set it
  React.useLayoutEffect(() => {
    if (
      isLeader &&
      originalValue === undefined &&
      defaultValue !== undefined &&
      writeDefault
    ) {
      setState(() => defaultValue, {
        replace: true,
      })
    }
  }, [defaultValue, isLeader, originalValue, setState, writeDefault])

  const isInvalid = useIsInvalid?.(state)

  // If the value is invalid and we have a default value, set it
  React.useLayoutEffect(() => {
    if (isLeader && isInvalid && defaultValue !== undefined) {
      setState(defaultValue, { replace: true })
    }
  }, [defaultValue, isInvalid, isLeader, setState])

  // Track changes to our serialized dependencies
  const dirtyDepsRef = React.useRef(false)
  const prevSerializedDepsRef = React.useRef(serializedDeps)

  if (prevSerializedDepsRef.current !== serializedDeps && isLeader) {
    dirtyDepsRef.current = true
  }

  prevSerializedDepsRef.current = serializedDeps

  // If the deps are dirty, we have a non-undefined value, and the default value is ready,
  // Reset the value to the default
  React.useEffect(() => {
    if (
      isLeader &&
      dirtyDepsRef.current &&
      originalValue !== undefined &&
      defaultValue !== undefined
    ) {
      dirtyDepsRef.current = false
      setState(() => defaultValue, { replace: true })
    }
  }, [defaultValue, dirtyDepsRef.current, isLeader, originalValue, setState])

  const getPersister = useGetLatest(usePersister?.())

  // Any time the value changes, allow us to persist it
  React.useEffect(() => {
    if (isLeader && state !== undefined) {
      getPersister()?.({
        state,
        key,
        deps,
      })
    }
  }, [getPersister, state, isLeader])

  const reset = React.useCallback(
    (opts?: { replace?: boolean }) => {
      setState(() => defaultValue, opts)
    },
    [defaultValue, setState],
  )

  // Return the value and updater
  return {
    state: state,
    setState,
    reset,
    createHref,
    isDirty,
  }
}

export function deepEqual(a: any, b: any): any {
  if (a === b) return true
  if (typeof a !== typeof b) return false

  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }

  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a),
      keysB = Object.keys(b)
    return (
      keysA.length === keysB.length &&
      keysA.every((key) => deepEqual(a[key], b[key]))
    )
  }

  return false
}

export function isObject(obj: any) {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null
}

export function functionalUpdate<T>(updater: Updater<T>, input: T): T {
  return typeof updater === 'function'
    ? (updater as UpdaterFn<T>)(input)
    : updater
}

function useGetLatest<T>(obj: T): () => T {
  const ref = React.useRef<T>(null!)
  ref.current = obj

  return React.useCallback(() => ref.current, [])
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export function replaceEqualDeep(a: any, b: any): any {
  if (a === b) return a

  const isArray = Array.isArray(a) && Array.isArray(b)
  if (isArray || (isPlainObject(a) && isPlainObject(b))) {
    const getKeys = (obj: any) =>
      isArray ? [...Array(obj.length).keys()] : Object.keys(obj)
    const aKeys = getKeys(a),
      bKeys = getKeys(b)
    const copy: any = isArray ? [] : {}
    let equalItems = 0

    for (const key of bKeys) {
      copy[key] = replaceEqualDeep(a[key], b[key])
      if (copy[key] === a[key]) equalItems++
    }

    return aKeys.length === bKeys.length && equalItems === aKeys.length
      ? a
      : copy
  }

  return b
}

function isPlainObject(o: any) {
  return (
    hasObjectPrototype(o) &&
    (!o.constructor ||
      (hasObjectPrototype(o.constructor.prototype) &&
        o.constructor.prototype.hasOwnProperty('isPrototypeOf')))
  )
}

function hasObjectPrototype(o: any) {
  return Object.prototype.toString.call(o) === '[object Object]'
}
