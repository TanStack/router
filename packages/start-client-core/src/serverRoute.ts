import type {
  AnyMiddleware,
  AssignAllServerContext,
  Middleware,
} from './createMiddleware'
import type {
  Assign,
  Constrain,
  Expand,
  ResolveParams,
} from '@tanstack/router-core'

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

export type ServerRouteMethodRecordValue<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> =
  | ServerRouteMethod<TPath, TVerb, TMiddlewares, undefined>
  | AnyRouteMethodsBuilder

export interface ServerRouteMethodsRecord<TPath extends string, TMiddlewares> {
  GET?: ServerRouteMethodRecordValue<TPath, 'GET', TMiddlewares>
  POST?: ServerRouteMethodRecordValue<TPath, 'POST', TMiddlewares>
  PUT?: ServerRouteMethodRecordValue<TPath, 'PUT', TMiddlewares>
  PATCH?: ServerRouteMethodRecordValue<TPath, 'PATCH', TMiddlewares>
  DELETE?: ServerRouteMethodRecordValue<TPath, 'DELETE', TMiddlewares>
  OPTIONS?: ServerRouteMethodRecordValue<TPath, 'OPTIONS', TMiddlewares>
  HEAD?: ServerRouteMethodRecordValue<TPath, 'HEAD', TMiddlewares>
}

export function createServerFileRoute<TPath extends string>(): (
  opts?: undefined,
  _opts?: ServerRouteOptions<TPath, any>,
) => ServerRoute<TPath> {
  return undefined as any
}

export interface ServerRouteOptions<TPath extends string, TMiddlewares> {
  middleware: Constrain<TMiddlewares, Middleware<any>>
  methods: ServerRouteMethods<TPath, ReadonlyArray<AnyMiddleware>>
}

export interface ServerRouteMiddleware<TPath extends string> {
  middleware: <const TNewMiddleware>(
    middleware: Constrain<TNewMiddleware, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteAfterMiddleware<TPath, TNewMiddleware>
}

export interface ServerRouteMethods<TPath extends string, TMiddlewares> {
  methods: (
    methodsOrGetMethods:
      | ServerRouteMethodsRecord<TPath, TMiddlewares>
      | ((
          api: ServerRouteMethodsBuilder<TPath, any, TMiddlewares>,
        ) => ServerRouteMethodsRecord<TPath, TMiddlewares>),
  ) => ServerRouteAfterMethods<TPath, TMiddlewares>
}

export interface ServerRoute<TPath extends string>
  extends ServerRouteMiddleware<TPath>,
    ServerRouteMethods<TPath, undefined> {}

export interface ServerRouteAfterMiddleware<TPath extends string, TMiddlewares>
  extends ServerRouteMethods<TPath, TMiddlewares> {}

export interface ServerRouteAfterMethods<TPath extends string, TMiddleware> {
  options: ServerRouteOptions<TPath, TMiddleware>
}

export interface ServerRouteMethodsBuilderTypes<
  TPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  middlewares: TMiddlewares
  methodMiddleware: TMethodMiddlewares
  path: TPath
}

export interface ServerRouteMethodsBuilderWithTypes<
  TPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
> {
  types: ServerRouteMethodsBuilderTypes<TPath, TMiddlewares, TMethodMiddlewares>
}

export type AnyRouteMethodsBuilder = ServerRouteMethodsBuilderWithTypes<
  any,
  any,
  any
>

export interface ServerRouteMethodsBuilder<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> extends ServerRouteMethodsBuilderWithTypes<TPath, TMiddlewares, undefined>,
    ServerRouteMethodsBuilderMiddleware<TPath, TVerb, TMiddlewares>,
    ServerRouteMethodBuilderValidator<TPath, TVerb, TMiddlewares, undefined>,
    ServerRouteMethodBuilderHandler<TPath, TVerb, TMiddlewares, undefined> {}

export interface ServerRouteMethodsBuilderMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: <const TNewMethodMiddlewares>(
    middleware: Constrain<TNewMethodMiddlewares, ReadonlyArray<AnyMiddleware>>,
  ) => ServerRouteMethodsBuilderAfterMiddleware<
    TPath,
    TVerb,
    TMiddlewares,
    TNewMethodMiddlewares
  >
}

export interface ServerRouteMethodsBuilderAfterMiddleware<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodsBuilderTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares
    >,
    ServerRouteMethodBuilderValidator<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    >,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    > {}

export interface ServerRouteMethodBuilderValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
  TMethodMiddlewares,
> {
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<
    TPath,
    TVerb,
    TMiddleware,
    TMethodMiddlewares
  >
}

export interface ServerRouteMethodBuilderAfterValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodsBuilderWithTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares
    >,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    > {}

export interface ServerRouteMethodBuilderHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> {
  handler: (
    handler: ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares
  >
}

export interface ServerRouteMethod<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> {
  middleware?: Constrain<TMiddlewares, Middleware<any>>
  validator?: ServerRouteMethodValidator<TPath, TVerb, TMiddlewares>
  handler?: ServerRouteMethodHandlerFn<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares
  >
}

type ServerRouteMethodValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
> = 'TODO'

export type ServerRouteMethodHandlerFn<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares
  >,
) => Promise<any>

export type AssignAllMethodContext<TMiddlewares, TMethodMiddlewares> = Assign<
  AssignAllServerContext<TMiddlewares>,
  AssignAllServerContext<TMethodMiddlewares>
>

export interface ServerRouteMethodHandlerCtx<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> {
  context: Expand<AssignAllMethodContext<TMiddlewares, TMethodMiddlewares>>
  request: Request
  params: ResolveParams<TPath>
  pathname: TPath
}

export interface ServerRouteMethodBase<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> {
  middleware: Array<Middleware<any>>
  validator: (
    validator: unknown,
  ) => ServerRouteMethodBuilderAfterValidator<
    TPath,
    TVerb,
    TMiddlewares,
    undefined
  >
  handler: (
    handler: ServerRouteMethodHandlerFn<TPath, TVerb, TMiddlewares, undefined>,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    undefined
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
> extends ServerRouteMethodsBuilderWithTypes<
    TPath,
    TMiddlewares,
    TMethodMiddlewares
  > {
  opts: ServerRouteMethod<TPath, TVerb, TMiddlewares, TMethodMiddlewares>
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
