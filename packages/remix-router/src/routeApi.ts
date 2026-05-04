import { BaseRouteApi, notFound } from '@tanstack/router-core'
import { useMatch } from './useMatch'
import { useRouteContext } from './useRouteContext'
import { useSearch } from './useSearch'
import { useParams } from './useParams'
import { useLoaderData } from './useLoaderData'
import { useLoaderDeps } from './useLoaderDeps'
import { useNavigate } from './useNavigate'
import { useRouter } from './useRouter'
import type { Handle } from '@remix-run/ui'
import type {
  AnyRouter,
  ConstrainLiteral,
  NotFoundError,
  RegisteredRouter,
  RouteIds,
  RouteTypesById,
  UseNavigateResult,
} from '@tanstack/router-core'

/**
 * `RouteApi` returned by `getRouteApi`. Mirrors `RouteApi` from
 * `@tanstack/react-router` — every accessor takes the component `handle`
 * as the first argument and is pre-bound to `this.id`.
 *
 * Useful in code-split files where the `Route` instance isn't directly in
 * scope but you know the route id.
 */
export class RouteApi<
  TId,
  TRouter extends AnyRouter = RegisteredRouter,
> extends BaseRouteApi<TId, TRouter> {
  /**
   * @deprecated Use `getRouteApi(id)` instead.
   */
  constructor({ id }: { id: TId }) {
    super({ id })
  }

  useMatch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useMatch(handle, { from: this.id as any, ...(opts as any) })

  useRouteContext = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useRouteContext(handle, { ...(opts as any), from: this.id as any })

  useSearch = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useSearch(handle, { ...(opts as any), from: this.id as any })

  useParams = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useParams(handle, { ...(opts as any), from: this.id as any })

  useLoaderDeps = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderDeps(handle, {
      ...(opts as any),
      from: this.id as any,
      strict: false,
    } as any)

  useLoaderData = (handle: Handle<any, any>, opts?: { select?: any }) =>
    useLoaderData(handle, {
      ...(opts as any),
      from: this.id as any,
      strict: false,
    } as any)

  useNavigate = (
    handle: Handle<any, any>,
  ): UseNavigateResult<RouteTypesById<TRouter, TId>['fullPath']> => {
    const router = useRouter(handle)
    return useNavigate(handle, {
      from: router.routesById[this.id as any]?.fullPath as any,
    })
  }

  notFound = (opts?: NotFoundError) =>
    notFound({ routeId: this.id as any, ...opts })
}

/**
 * Get a `RouteApi` instance bound to a route id.
 *
 * @example
 * ```ts
 * const api = getRouteApi('/users/$id')
 * function UserDetail(handle: Handle) {
 *   const data = api.useLoaderData(handle)
 *   return () => <h1>{data()?.name}</h1>
 * }
 * ```
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/getRouteApiFunction
 */
export function getRouteApi<
  const TId,
  TRouter extends AnyRouter = RegisteredRouter,
>(id: ConstrainLiteral<TId, RouteIds<TRouter['routeTree']>>) {
  return new RouteApi<TId, TRouter>({ id })
}
