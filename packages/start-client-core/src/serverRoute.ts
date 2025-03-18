import type { Middleware } from './createMiddleware'
import type { ResolveParams } from '@tanstack/router-core'

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

export function createServerFileRoute<TPath extends string>(
  opts: RouteServerOptions<TPath>,
): ServerRoute {
  return undefined as any
}

export interface ServerRouteOptions<TPath extends string> {
  middleware: Array<Middleware<any>>
  methods: {
    GET: MethodOption<TPath, 'GET'>
    POST: MethodOption<TPath, 'POST'>
    PUT: MethodOption<TPath, 'PUT'>
    PATCH: MethodOption<TPath, 'PATCH'>
    DELETE: MethodOption<TPath, 'DELETE'>
    OPTIONS: MethodOption<TPath, 'OPTIONS'>
    HEAD: MethodOption<TPath, 'HEAD'>
  }
}

export interface ServerRoute {}

export type MethodOption<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> = Method<TPath, TVerb, Middleware<any>>
// MethodAfterHandler<TPath, TVerb>

export type Method<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
  TMiddleware,
> = {
  middleware: TMiddleware
  validator: (validator: unknown) => MethodAfterValidator<TPath, TVerb>
  handler: (
    handler: MethodHandlerFn<TPath, TVerb>,
  ) => MethodAfterHandler<TPath, TVerb>
}

export type MethodHandlerFn<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> = (ctx: MethodHandlerCtx<TPath, TVerb>) => Promise<any>

export interface MethodHandlerCtx<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  request: Request
  params: ResolveParams<TPath>
  pathname: TPath
}

export interface MethodBase<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  middleware: Array<Middleware<any>>
  validator: (validator: unknown) => MethodAfterValidator<TPath, TVerb>
  handler: (
    handler: MethodHandlerFn<TPath, TVerb>,
  ) => MethodAfterHandler<TPath, TVerb>
}

export interface MethodAfterValidator<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  opts: MethodOptions<TPath, TVerb>
  handler: (
    handler: MethodHandlerFn<TPath, TVerb>,
  ) => MethodAfterHandler<TPath, TVerb>
}

export interface MethodAfterHandler<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  opts: MethodOptions<TPath, TVerb>
}

export const methods = {
  createGet: createMethodFn('GET'),
  createPost: createMethodFn('POST'),
  createPut: createMethodFn('PUT'),
  createPatch: createMethodFn('PATCH'),
  createDelete: createMethodFn('DELETE'),
  createOptions: createMethodFn('OPTIONS'),
  createHead: createMethodFn('HEAD'),
}

function createMethodFn<TVerb extends HTTP_API_METHOD>(verb: TVerb) {
  return function createMethod<TPath extends string>(
    opts: MethodOptions<TPath, TVerb>,
  ): MethodBase<TPath, TVerb> {
    return undefined as any
  }
}

export interface MethodOptions<
  TPath extends string,
  TVerb extends HTTP_API_METHOD,
> {
  middleware: Array<Middleware<any>>
}
