import type { AnyMiddleware, Middleware } from './createMiddleware'
import type {
  AnyValidator,
  Constrain,
  ResolveParams,
} from '@tanstack/router-core'

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

export interface RouteServerMethodRecord<TPath extends string> {
  validator?: AnyValidator
  middleware?: ReadonlyArray<AnyMiddleware>
  handler?: StartAPIMethodCallback<TPath>
}

export type RouteServerMethodOption<TPath extends string> =
  | StartAPIMethodCallback<TPath>
  | RouteServerMethodRecord<TPath>

export interface RouteServerMethodsRecord<
  TPath extends string,
  TGet,
  TPost,
  TPut,
  TPatch,
  TDelete,
  TOptions,
  THead,
> {
  GET?: Constrain<TGet, RouteServerMethodOption<TPath>>
  POST?: Constrain<TPost, RouteServerMethodOption<TPath>>
  PUT?: Constrain<TPut, RouteServerMethodOption<TPath>>
  PATCH?: Constrain<TPatch, RouteServerMethodOption<TPath>>
  DELETE?: Constrain<TDelete, RouteServerMethodOption<TPath>>
  OPTIONS?: Constrain<TOptions, RouteServerMethodOption<TPath>>
  HEAD?: Constrain<THead, RouteServerMethodOption<TPath>>
}

export interface RouteServerOptions<
  TPath extends string,
  TGet,
  TPost,
  TPut,
  TPatch,
  TDelete,
  TOptions,
  THead,
> {
  methods: RouteServerMethodsRecord<
    TPath,
    TGet,
    TPost,
    TPut,
    TPatch,
    TDelete,
    TOptions,
    THead
  >
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
  pathname: TPath
  params: ResolveParams<TPath>
}) => Response | Promise<Response>

export function createServerFileRoute<TPath extends string>(): <
  TGet,
  TPost,
  TPut,
  TPatch,
  TDelete,
  TOptions,
  THead,
>(
  opts: RouteServerOptions<
    TPath,
    TGet,
    TPut,
    TPost,
    TPatch,
    TDelete,
    TOptions,
    THead
  >,
) => ServerRoute {
  return undefined as any
}

export interface ServerRouteOptions<TPath extends string> {
  middleware: Array<Middleware<any, any>>
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
> = Method<TPath, TVerb, Middleware<any, any>>
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
  middleware: Array<Middleware<any, any>>
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
  middleware: Array<Middleware<any, any>>
}
