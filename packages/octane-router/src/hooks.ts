// The read hooks — ports of react-router's useMatch.tsx / useParams / useSearch /
// useLoaderData / useLoaderDeps / useRouteContext / useNavigate / useCanGoBack /
// Matches.tsx (useMatches / useParentMatches / useChildMatches). Everything match-
// shaped funnels through `useMatch`, which subscribes to ONE match store:
//   - `from` given → `router.stores.getRouteMatchStore(from)` (a cached computed
//     that resolves a routeId to its current match);
//   - no `from` → the NEAREST match via `matchContext` (the match id the enclosing
//     `<Match>` provided) — NOT the leaf match.
// A missing match throws unless `shouldThrow: false` (upstream invariant).
// Selectors run through `useStructuralSharing` (replaceEqualDeep against the
// previous selection when `structuralSharing ?? defaultStructuralSharing`).
import { useCallback, useContext, useRef } from 'octane'
import { replaceEqualDeep } from '@tanstack/router-core'
import { matchContext, useRouter } from './context'
import { useStore } from './useStore'
import { splitSlot, subSlot } from './internal'
import type { StructuralSharingOption } from './structuralSharing'
import type {
  AnyRouter,
  FromPathOption,
  RegisteredRouter,
  ThrowConstraint,
  ThrowOrOptional,
  UseLoaderDataResult,
  UseLoaderDepsResult,
  UseNavigateResult,
  UseParamsResult,
  UseRouteContextOptions,
  UseRouteContextResult,
  UseSearchResult,
} from '@tanstack/router-core'
import type {
  UseLoaderDataOptions,
  UseLoaderDepsOptions,
  UseLocationBaseOptions,
  UseLocationResult,
  UseMatchOptions,
  UseMatchResult,
  UseMatchesBaseOptions,
  UseMatchesResult,
  UseParamsOptions,
  UseSearchOptions,
} from './routeHookTypes'

// Sentinel store + selection for "no match at this id" (upstream's dummyStore).
const dummyStore = {
  get() {},
  subscribe() {
    return { unsubscribe() {} }
  },
}

// Selector wrapper honoring structural sharing: when enabled, the selection is
// replaceEqualDeep'd against the previous one so deep-equal slices keep their
// reference (no re-render). Port of react-router's useStructuralSharing.
function useStructuralSharing(
  opts: any,
  router: any,
  slot: symbol | undefined,
) {
  const previousResult = useRef<any>(undefined, subSlot(slot, 'ss'))
  return (slice: any) => {
    const selected = opts?.select ? opts.select(slice) : slice
    if (opts?.structuralSharing ?? router.options.defaultStructuralSharing) {
      return (previousResult.current = replaceEqualDeep(
        previousResult.current,
        selected,
      ))
    }
    return selected
  }
}

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
export function useMatch(...args: Array<any>): any {
  return useMatchImpl(args)
}

function useMatchImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const router = useRouter()
  // octane has no rules of hooks, so the nearest-match context is read
  // unconditionally (upstream reads a dummy context when `from` is given).
  const nearestMatchId = useContext(matchContext)
  const matchStore = opts.from
    ? router.stores.getRouteMatchStore(opts.from)
    : router.stores.matchStores.get(nearestMatchId as string)

  const selector = useStructuralSharing(opts, router, subSlot(slot, 'm'))
  const matchSelection = useStore(
    matchStore ?? dummyStore,
    (match: any) => (match ? selector(match) : dummyStore),
    undefined,
    subSlot(slot, 'm:us'),
  )

  if (matchSelection !== dummyStore) {
    return matchSelection
  }
  if (opts.shouldThrow ?? true) {
    throw new Error(
      `Invariant failed: Could not find ${
        opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'
      }`,
    )
  }
  return undefined
}

export function useParams<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseParamsOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<UseParamsResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
export function useParams(...args: Array<any>): any {
  return useParamsImpl(args)
}

function useParamsImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  return useMatchImpl([
    {
      from: opts.from,
      strict: opts.strict,
      shouldThrow: opts.shouldThrow,
      structuralSharing: opts.structuralSharing,
      select: (match: any) => {
        const params =
          opts.strict === false ? match.params : match._strictParams
        return opts.select ? opts.select(params) : params
      },
    },
    subSlot(slot, 'params'),
  ])
}

export function useSearch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseSearchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected,
    TStructuralSharing
  >,
): ThrowOrOptional<UseSearchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
export function useSearch(...args: Array<any>): any {
  return useSearchImpl(args)
}

function useSearchImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  return useMatchImpl([
    {
      from: opts.from,
      strict: opts.strict,
      shouldThrow: opts.shouldThrow,
      structuralSharing: opts.structuralSharing,
      select: (match: any) =>
        opts.select ? opts.select(match.search) : match.search,
    },
    subSlot(slot, 'search'),
  ])
}

export function useLoaderData<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDataOptions<
    TRouter,
    TFrom,
    TStrict,
    TSelected,
    TStructuralSharing
  >,
): UseLoaderDataResult<TRouter, TFrom, TStrict, TSelected>
export function useLoaderData(...args: Array<any>): any {
  return useLoaderDataImpl(args)
}

function useLoaderDataImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  return useMatchImpl([
    {
      from: opts.from,
      strict: opts.strict,
      structuralSharing: opts.structuralSharing,
      select: (match: any) =>
        opts.select ? opts.select(match.loaderData) : match.loaderData,
    },
    subSlot(slot, 'loader'),
  ])
}

export function useLoaderDeps<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts: UseLoaderDepsOptions<TRouter, TFrom, TSelected, TStructuralSharing>,
): UseLoaderDepsResult<TRouter, TFrom, TSelected>
export function useLoaderDeps(...args: Array<any>): any {
  return useLoaderDepsImpl(args)
}

function useLoaderDepsImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const { select, ...rest } = opts
  return useMatchImpl([
    {
      ...rest,
      select: (match: any) =>
        select ? select(match.loaderDeps) : match.loaderDeps,
    },
    subSlot(slot, 'deps'),
  ])
}

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>
export function useRouteContext(...args: Array<any>): any {
  return useRouteContextImpl(args)
}

function useRouteContextImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  return useMatchImpl([
    {
      ...opts,
      select: (match: any) =>
        opts.select ? opts.select(match.context) : match.context,
    },
    subSlot(slot, 'ctx'),
  ])
}

export function useLocation<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseLocationBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseLocationResult<TRouter, TSelected>
export function useLocation(...args: Array<any>): any {
  return useLocationImpl(args)
}

function useLocationImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const router = useRouter()
  return useStore(
    router.stores.location,
    useStructuralSharing(opts, router, subSlot(slot, 'loc')),
    undefined,
    subSlot(slot, 'loc:us'),
  )
}

export function useMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected>
export function useMatches(...args: Array<any>): any {
  return useMatchesImpl(args)
}

function useMatchesImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const router = useRouter()
  return useStore(
    router.stores.matches,
    useStructuralSharing(opts, router, subSlot(slot, 'matches')),
    undefined,
    subSlot(slot, 'matches:us'),
  )
}

export function useParentMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected>
export function useParentMatches(...args: Array<any>): any {
  return useParentMatchesImpl(args)
}

function useParentMatchesImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const contextMatchId = useContext(matchContext)
  return useMatchesImpl([
    {
      select: (matches: Array<any>) => {
        matches = matches.slice(
          0,
          matches.findIndex((d: any) => d.id === contextMatchId),
        )
        return opts.select ? opts.select(matches) : matches
      },
      structuralSharing: opts.structuralSharing,
    },
    subSlot(slot, 'parents'),
  ])
}

export function useChildMatches<
  TRouter extends AnyRouter = RegisteredRouter,
  TSelected = unknown,
  TStructuralSharing extends boolean = boolean,
>(
  opts?: UseMatchesBaseOptions<TRouter, TSelected, TStructuralSharing> &
    StructuralSharingOption<TRouter, TSelected, TStructuralSharing>,
): UseMatchesResult<TRouter, TSelected>
export function useChildMatches(...args: Array<any>): any {
  return useChildMatchesImpl(args)
}

function useChildMatchesImpl(args: Array<any>): any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const contextMatchId = useContext(matchContext)
  return useMatchesImpl([
    {
      select: (matches: Array<any>) => {
        matches = matches.slice(
          matches.findIndex((d: any) => d.id === contextMatchId) + 1,
        )
        return opts.select ? opts.select(matches) : matches
      },
      structuralSharing: opts.structuralSharing,
    },
    subSlot(slot, 'children'),
  ])
}

// Returns a STABLE navigate function (upstream useCallback([from, router])) that
// forwards to `router.navigate`, defaulting `from` to the hook's option.
export function useNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(options?: {
  from?: FromPathOption<TRouter, TDefaultFrom>
}): UseNavigateResult<TDefaultFrom>
export function useNavigate(...args: Array<any>): (to: any) => any {
  return useNavigateImpl(args)
}

function useNavigateImpl(args: Array<any>): (to: any) => any {
  const [user, slot] = splitSlot(args)
  const opts = user[0] ?? {}
  const router = useRouter(opts.router ? { router: opts.router } : undefined)
  return useCallback(
    (options: any) =>
      router.navigate({ ...options, from: options?.from ?? opts.from }),
    [opts.from, router],
    subSlot(slot, 'nav'),
  )
}

// True when the current history entry isn't the first (there is somewhere to go
// back to) — per upstream useCanGoBack (location.state.__TSR_index !== 0).
export function useCanGoBack(): boolean
export function useCanGoBack(...args: Array<any>): boolean {
  const [, slot] = splitSlot(args)
  const router = useRouter()
  return useStore(
    router.stores.location,
    (location: any) => location.state.__TSR_index !== 0,
    undefined,
    subSlot(slot, 'back'),
  )
}

/** @internal Framework primitives use explicit Octane hook slots. */
export const internalHooks = {
  useMatch: (...args: Array<any>) => useMatchImpl(args),
  useParams: (...args: Array<any>) => useParamsImpl(args),
  useSearch: (...args: Array<any>) => useSearchImpl(args),
  useLoaderData: (...args: Array<any>) => useLoaderDataImpl(args),
  useLoaderDeps: (...args: Array<any>) => useLoaderDepsImpl(args),
  useRouteContext: (...args: Array<any>) => useRouteContextImpl(args),
  useLocation: (...args: Array<any>) => useLocationImpl(args),
  useMatches: (...args: Array<any>) => useMatchesImpl(args),
  useParentMatches: (...args: Array<any>) => useParentMatchesImpl(args),
  useChildMatches: (...args: Array<any>) => useChildMatchesImpl(args),
  useNavigate: (...args: Array<any>) => useNavigateImpl(args),
}
