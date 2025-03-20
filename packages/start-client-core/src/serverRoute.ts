import type { Middleware } from './createMiddleware'
import type { Constrain, ResolveParams } from '@tanstack/router-core'

export const ServerRouteVerbs = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'HEAD',
] as const
export type ServerRouteVerb = (typeof ServerRouteVerbs)[number]

export interface ServerRouteMethods<TPath extends string> {
  GET?: ServerRouteMethod<TPath, 'GET', any>
  POST?: ServerRouteMethod<TPath, 'POST', any>
  PUT?: ServerRouteMethod<TPath, 'PUT', any>
  PATCH?: ServerRouteMethod<TPath, 'PATCH', any>
  DELETE?: ServerRouteMethod<TPath, 'DELETE', any>
  OPTIONS?: ServerRouteMethod<TPath, 'OPTIONS', any>
  HEAD?: ServerRouteMethod<TPath, 'HEAD', any>
}

export function createServerFileRoute<TPath extends string>(): (
  opts?: undefined,
  _opts?: ServerRouteOptions<TPath, any>,
) => ServerRoute<TPath> {
  return undefined as any
}

export interface ServerRouteOptions<TPath extends string, TMiddleware> {
  middleware: Constrain<TMiddleware, Middleware<any>>
  methods: ServerRouteMethods<TPath>
}

export interface ServerRoute<TPath extends string> {
  middleware: <TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, Middleware<any>>,
  ) => ServerRouteAfterMiddleware<TPath, TNewMiddleware>
}

export interface ServerRouteAfterMiddleware<TPath extends string, TMiddleware> {
  methods: (
    methodsOrGetMethods:
      | ServerRouteMethods<TPath>
      | ((api: ServerRouteMethodsBuilder<TPath>) => ServerRouteMethods<TPath>),
  ) => ServerRouteAfterMethods<TPath, TMiddleware>
}

export interface ServerRouteAfterMethods<TPath extends string, TMiddleware> {
  options: ServerRouteOptions<TPath, TMiddleware>
}

export interface ServerRouteMethodsBuilder<TPath extends string>
  extends ServerRouteMethodsBuilderMiddleware<TPath, any, any>,
    ServerRouteMethodBuilderValidator<TPath, any, any>,
    ServerRouteMethodBuilderHandler<TPath, any, any> {}

export interface ServerRouteMethodsBuilderMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> {
  middleware: <TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, Middleware<any>>,
  ) => ServerRouteMethodsBuilderAfterMiddleware<TPath, TVerb, TMiddleware>
}

export interface ServerRouteMethodsBuilderAfterMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> extends ServerRouteMethodBuilderValidator<TPath, TVerb, TMiddleware>,
    ServerRouteMethodBuilderHandler<TPath, TVerb, TMiddleware> {}

export interface ServerRouteMethodBuilderValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> extends ServerRouteMethodBuilderAfterValidator<TPath, TVerb, TMiddleware> {
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<TPath, TVerb, TMiddleware>
}

export interface ServerRouteMethodBuilderAfterValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> extends ServerRouteMethodBuilderHandler<TPath, TVerb, TMiddleware> {}

export interface ServerRouteMethodBuilderHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> {
  handler: (
    handler: ServerRouteMethodHandlerFn<TPath, TVerb>,
  ) => ServerRouteMethod<TPath, TVerb, TMiddleware>
}

export interface ServerRouteMethod<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> {
  middleware?: Constrain<TMiddleware, Middleware<any>>
  validator?: ServerRouteMethodValidator<TPath, TVerb, TMiddleware>
  handler?: ServerRouteMethodHandlerFn<TPath, TVerb>
}

type ServerRouteMethodValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> = 'TODO'

export type ServerRouteMethodHandlerFn<
  TPath extends string,
  TVerb extends ServerRouteVerb,
> = (ctx: ServerRouteMethodHandlerCtx<TPath, TVerb>) => Promise<any>

export interface ServerRouteMethodHandlerCtx<
  TPath extends string,
  TVerb extends ServerRouteVerb,
> {
  request: Request
  params: ResolveParams<TPath>
  pathname: TPath
}

export interface ServerRouteMethodBase<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> {
  middleware: Array<Middleware<any>>
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<TPath, TVerb, TMiddleware>
  handler: (
    handler: ServerRouteMethodHandlerFn<TPath, TVerb>,
  ) => ServerRouteMethodBuilderAfterHandler<TPath, TVerb, TMiddleware>
}

export interface ServerRouteMethodBuilderAfterHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> {
  opts: ServerRouteMethod<TPath, TVerb, TMiddleware>
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

function createMethodFn<TVerb extends ServerRouteVerb>(verb: TVerb) {
  return function createMethod<TPath extends string>(
    opts: ServerRouteMethodOptions<TPath, TVerb>,
  ): ServerRouteMethodBase<TPath, TVerb, any> {
    return undefined as any
  }
}

export interface ServerRouteMethodOptions<
  TPath extends string,
  TVerb extends ServerRouteVerb,
> {
  middleware: Array<Middleware<any>>
}
