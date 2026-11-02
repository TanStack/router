import { useMatch } from './useMatch'
import type * as Vue from 'vue'
import type {
  AnyRouter,
  Register,
  RegisteredRouter,
  RegisteredRouterOf,
  UseRouteContextBaseOptions,
  UseRouteContextOptions,
  UseRouteContextResult,
} from '@tanstack/router-core'

export type UseRouteContextRoute<out TFrom, TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  TSelected = unknown,
>(
  opts?: UseRouteContextBaseOptions<TRouter, TFrom, true, TSelected>,
) => Vue.Ref<UseRouteContextResult<TRouter, TFrom, true, TSelected>>

/**
 * The signature of `useRouteContext`, typed against the router of `TDefaultRegister` unless a router
 * type is passed explicitly. Route modules export a `useRouteContext` of this type.
 */
export type UseRouteContextFn<TDefaultRegister = Register> = <
  TRouter extends AnyRouter = RegisteredRouterOf<TDefaultRegister>,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
) => Vue.Ref<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>>

export function useRouteContext<
  TRouter extends AnyRouter = RegisteredRouter,
  const TFrom extends string | undefined = undefined,
  TStrict extends boolean = true,
  TSelected = unknown,
>(
  opts: UseRouteContextOptions<TRouter, TFrom, TStrict, TSelected>,
): Vue.Ref<UseRouteContextResult<TRouter, TFrom, TStrict, TSelected>> {
  return useMatch({
    ...opts,
    select: (match) =>
      opts.select ? opts.select(match.context) : match.context,
  }) as any
}
