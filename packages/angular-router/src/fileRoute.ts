import {
  AnyRoute,
  AnyRouter,
  ConstrainLiteral,
  LazyRouteOptions,
  RegisteredRouter,
  RouteById,
  RouteIds,
} from '@tanstack/router-core'
import { injectMatch, InjectMatchRoute } from './injectMatch'
import { InjectRouteContextRoute } from './injectRouteContext'
import { injectSearch, InjectSearchRoute } from './injectSearch'
import { injectParams, InjectParamsRoute } from './injectParams'
import { injectLoaderDeps, InjectLoaderDepsRoute } from './injectLoaderDeps'
import { injectLoaderData, InjectLoaderDataRoute } from './injectLoaderData'
import { injectNavigate, InjectNavigateResult } from './injectNavigate'
import { injectRouter } from './injectRouter'

declare module '@tanstack/router-core' {
  export interface LazyRoute<in out TRoute extends AnyRoute> {
    injectMatch: InjectMatchRoute<TRoute['id']>
    injectRouteContext: InjectRouteContextRoute<TRoute['id']>
    injectSearch: InjectSearchRoute<TRoute['id']>
    injectParams: InjectParamsRoute<TRoute['id']>
    injectLoaderDeps: InjectLoaderDepsRoute<TRoute['id']>
    injectLoaderData: InjectLoaderDataRoute<TRoute['id']>
    injectNavigate: () => InjectNavigateResult<TRoute['fullPath']>
  }
}

export class LazyRoute<TRoute extends AnyRoute> {
  options: {
    id: string
  } & LazyRouteOptions

  constructor(
    opts: {
      id: string
    } & LazyRouteOptions,
  ) {
    this.options = opts
  }

  injectMatch: InjectMatchRoute<TRoute['id']> = (opts) => {
    return injectMatch({
      select: opts?.select,
      from: this.options.id,
    } as any) as any
  }

  injectRouteContext: InjectRouteContextRoute<TRoute['id']> = (opts) => {
    return injectMatch({
      from: this.options.id,
      select: (d: any) => (opts?.select ? opts.select(d.context) : d.context),
    }) as any
  }

  injectSearch: InjectSearchRoute<TRoute['id']> = (opts) => {
    return injectSearch({
      select: opts?.select,
      from: this.options.id,
    } as any) as any
  }

  injectParams: InjectParamsRoute<TRoute['id']> = (opts) => {
    return injectParams({
      select: opts?.select,
      from: this.options.id,
    } as any) as any
  }

  injectLoaderDeps: InjectLoaderDepsRoute<TRoute['id']> = (opts) => {
    return injectLoaderDeps({ ...opts, from: this.options.id } as any)
  }

  injectLoaderData: InjectLoaderDataRoute<TRoute['id']> = (opts) => {
    return injectLoaderData({ ...opts, from: this.options.id } as any)
  }

  injectNavigate = (): InjectNavigateResult<TRoute['fullPath']> => {
    const router = injectRouter()
    return injectNavigate({ from: router.routesById[this.options.id].fullPath })
  }
}

/**
 * Creates a lazily-configurable code-based route stub by ID.
 *
 * Use this for code-splitting with code-based routes. The returned function
 * accepts only non-critical route options like `component`, `pendingComponent`,
 * `errorComponent`, and `notFoundComponent` which are applied when the route
 * is matched.
 *
 * @param id Route ID string literal to associate with the lazy route.
 * @returns A function that accepts lazy route options and returns a `LazyRoute`.
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createLazyRouteFunction
 */
export function createLazyRoute<
  TRouter extends AnyRouter = RegisteredRouter,
  TId extends string = string,
  TRoute extends AnyRoute = RouteById<TRouter['routeTree'], TId>,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return (opts: LazyRouteOptions) => {
    return new LazyRoute<TRoute>({
      id: id,
      ...opts,
    })
  }
}
