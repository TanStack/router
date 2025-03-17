import type { AnyRoute, ResolveParams } from '@tanstack/router-core'

export const HTTP_API_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const
export type HTTP_API_METHOD = (typeof HTTP_API_METHODS)[number]

export interface RouteServerOptions<TPath extends string> {
  methods: Partial<Record<HTTP_API_METHOD, StartAPIMethodCallback<TPath>>>
}

export interface RouteServerVerbOptions<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  request: Request
  params: ResolveParams<TPath>
}

export type StartAPIMethodCallback<TPath extends string> = (ctx: {
  request: Request
  params: ResolveParams<TPath>
}) => Response | Promise<Response>

declare module '@tanstack/router-core' {
  interface Route<
    in out TParentRoute extends AnyRoute,
    in out TPath extends string,
    in out TFullPath extends string,
    in out TCustomId extends string,
    in out TId extends string,
    in out TSearchValidator,
    in out TParams,
    in out TRouterContext,
    in out TRouteContextFn,
    in out TBeforeLoadFn,
    in out TLoaderDeps extends Record<string, any>,
    in out TLoaderFn,
    in out TChildren,
    in out TFileRouteTypes,
  > {
    server: (opts: RouteServerOptions<TPath>) => this
    GET: (opts: RouteServerVerbOptions<TPath, 'GET'>) => this
    POST: (opts: RouteServerVerbOptions<TPath, 'POST'>) => this
    PUT: (opts: RouteServerVerbOptions<TPath, 'PUT'>) => this
    PATCH: (opts: RouteServerVerbOptions<TPath, 'PATCH'>) => this
    DELETE: (opts: RouteServerVerbOptions<TPath, 'DELETE'>) => this
    OPTIONS: (opts: RouteServerVerbOptions<TPath, 'OPTIONS'>) => this
    HEAD: (opts: RouteServerVerbOptions<TPath, 'HEAD'>) => this
  }
}
