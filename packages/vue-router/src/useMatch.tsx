import * as Vue from 'vue'
import { invariant } from '@tanstack/router-core'
import { resolveRouteId } from '@tanstack/router-core/_internal/route-module'
import { isServer } from '@tanstack/router-core/isServer'
import { useSelector } from '@tanstack/vue-store'
import { routeIdContext } from './matchContext'
import { useRouter } from './useRouter'
import type {
  AnyRouter,
  MakeRouteMatch,
  MakeRouteMatchUnion,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  RouteScopeMarker,
  StrictOrFrom,
  ThrowConstraint,
  ThrowOrOptional,
} from '@tanstack/router-core'

export interface UseMatchBaseOptions<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> {
  select?: (
    match: TRouter['routeTree'] extends RouteScopeMarker
      ? TStrict extends true
        ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
        : MakeRouteMatchUnion<TRouter>
      : MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>,
  ) => TSelected
  shouldThrow?: TThrow
}

export type UseMatchRoute<out TFrom, TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
  TThrow extends boolean = true,
>(
  opts?: UseMatchBaseOptions<TRouter, TFrom, true, TThrow, TSelected>,
) => Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, true, TSelected>, TThrow>
>

export type UseMatchOptions<
  TRouter extends AnyRouter,
  TFrom extends string | undefined,
  TStrict extends boolean,
  TThrow extends boolean,
  TSelected,
> = StrictOrFrom<TRouter, TFrom, TStrict> &
  UseMatchBaseOptions<TRouter, TFrom, TStrict, TThrow, TSelected>

export type UseMatchResult<
  TRouter extends AnyRouter,
  TFrom,
  TStrict extends boolean,
  TSelected,
> = unknown extends TSelected
  ? TStrict extends true
    ? MakeRouteMatch<TRouter['routeTree'], TFrom, TStrict>
    : MakeRouteMatchUnion<TRouter>
  : TSelected

/**
 * The signature of `useMatch`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useMatch` of this type.
 */
export type UseMatchFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
) => Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
>

export function useMatch<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TThrow extends boolean = true,
  TSelected = unknown,
>(
  opts: UseMatchOptions<
    TRouter,
    TFrom,
    TStrict,
    ThrowConstraint<TStrict, TThrow>,
    TSelected
  >,
): Vue.Ref<
  ThrowOrOptional<UseMatchResult<TRouter, TFrom, TStrict, TSelected>, TThrow>
> {
  const router = useRouter<TRouter>()

  // During SSR we render exactly once and do not need reactivity.
  // Avoid store subscriptions and pending/transition bookkeeping on the server.
  if (isServer ?? router.isServer) {
    const nearestRouteId = Vue.inject(routeIdContext, undefined)
    // `from` can be the module-local id of a module installed several times:
    // it resolves through the nearest match.
    const routeId =
      resolveRouteId && opts.from
        ? resolveRouteId(router, opts.from, nearestRouteId)
        : (opts.from ?? nearestRouteId)
    const matchStore = routeId
      ? router.stores.getMatchStore(routeId)
      : undefined
    const match = matchStore?.get()

    if ((opts.shouldThrow ?? true) && !match) {
      if (process.env.NODE_ENV !== 'production') {
        throw new Error(
          `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
        )
      }

      invariant()
    }

    if (match === undefined) {
      return Vue.ref(undefined) as Vue.Ref<
        ThrowOrOptional<
          UseMatchResult<TRouter, TFrom, TStrict, TSelected>,
          TThrow
        >
      >
    }

    return Vue.ref(
      opts.select
        ? opts.select(
            match as unknown as Parameters<NonNullable<typeof opts.select>>[0],
          )
        : match,
    ) as Vue.Ref<
      ThrowOrOptional<
        UseMatchResult<TRouter, TFrom, TStrict, TSelected>,
        TThrow
      >
    >
  }

  // Set up reactive match value based on lookup strategy.
  let match: Readonly<Vue.Ref<any>>
  const nearestRouteId = Vue.inject(routeIdContext)
  // `from` can be the module-local id of a module installed several times:
  // it resolves through the nearest match.
  const routeId =
    resolveRouteId && opts.from
      ? resolveRouteId(router, opts.from, nearestRouteId)
      : (opts.from ?? nearestRouteId)

  if (routeId) {
    // Subscribe to the stable per-route presentation atom. The nearest
    // routeId is provided by the nearest Match component and doesn't change
    // for the component's lifetime, so the store is stable.
    match = useSelector(router.stores.getMatchStore(routeId))
  } else {
    // No route context — will fall through to error handling below
    match = Vue.ref(undefined) as Readonly<Vue.Ref<undefined>>
  }

  const ownsMatch = nearestRouteId !== undefined && routeId === nearestRouteId
  let lastOwnedMatch: any
  const result = Vue.computed<any>(() => {
    if (match.value !== undefined && ownsMatch) {
      lastOwnedMatch = match.value
    }
    const selectedMatch = match.value ?? lastOwnedMatch
    if (selectedMatch === undefined) {
      if (opts.shouldThrow ?? true) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            `Invariant failed: Could not find ${opts.from ? `an active match from "${opts.from}"` : 'a nearest match!'}`,
          )
        }

        invariant()
      }

      return undefined
    }

    return opts.select ? opts.select(selectedMatch) : selectedMatch
  })

  // Keep eager throw behavior for setups that call useMatch for side effects only.
  result.value

  return result
}
