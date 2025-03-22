import type {
  AnyMiddleware,
  AssignAllServerContext,
  IntersectAllValidatorOutputs,
  Middleware,
} from './createMiddleware'
import type {
  AnyRoute,
  Assign,
  Constrain,
  Expand,
  IntersectAssign,
  ResolveParams,
  RouteConstraints,
} from '@tanstack/router-core'
import type { ConstrainValidator } from './createServerFn'

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
  | ServerRouteMethodHandlerFn<TPath, TVerb, TMiddlewares, undefined, undefined>
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

export type CreateServerFileRoute<
  TFilePath extends string,
  TParentRoute extends AnyRoute,
  TId extends RouteConstraints['TId'],
  TPath extends RouteConstraints['TPath'],
  TFullPath extends RouteConstraints['TFullPath'],
> = (options?: undefined) => ServerRoute<TPath>

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
  TValidator,
> {
  middlewares: TMiddlewares
  methodMiddleware: TMethodMiddlewares
  validator: TValidator
  path: TPath
}

export interface ServerRouteMethodsBuilderWithTypes<
  TPath extends string,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  _types: ServerRouteMethodsBuilderTypes<
    TPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >
}

export type AnyRouteMethodsBuilder = ServerRouteMethodsBuilderWithTypes<
  any,
  any,
  any,
  any
>

export interface ServerRouteMethodsBuilder<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
> extends ServerRouteMethodsBuilderWithTypes<
      TPath,
      TMiddlewares,
      undefined,
      undefined
    >,
    ServerRouteMethodsBuilderMiddleware<TPath, TVerb, TMiddlewares>,
    ServerRouteMethodBuilderValidator<TPath, TVerb, TMiddlewares, undefined>,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined
    > {}

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
> extends ServerRouteMethodsBuilderWithTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares,
      undefined
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
      TMethodMiddlewares,
      undefined
    > {}

export interface ServerRouteMethodBuilderValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddleware,
  TMethodMiddlewares,
> {
  validator: <TValidator>(
    validator: ConstrainValidator<TValidator>,
  ) => ServerRouteMethodBuilderAfterValidator<
    TPath,
    TVerb,
    TMiddleware,
    TMethodMiddlewares,
    TValidator
  >
}

export interface ServerRouteMethodBuilderAfterValidator<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> extends ServerRouteMethodsBuilderWithTypes<
      TPath,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    >,
    ServerRouteMethodBuilderHandler<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    > {}

export interface ServerRouteMethodBuilderHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  handler: (
    handler: ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >
}

export interface ServerRouteMethod<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  middleware?: Constrain<TMiddlewares, Middleware<any>>
  validator?: ServerRouteMethodValidator<TPath, TVerb, TMiddlewares>
  handler?: ServerRouteMethodHandlerFn<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
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
  TValidator,
> = (
  ctx: ServerRouteMethodHandlerCtx<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >,
) => Promise<any>

export type AssignAllMethodContext<TMiddlewares, TMethodMiddlewares> = Assign<
  AssignAllServerContext<TMiddlewares>,
  AssignAllServerContext<TMethodMiddlewares>
>

export type IntersectAllMethodValidatorOutputs<
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> = IntersectAssign<
  IntersectAllValidatorOutputs<TMiddlewares, undefined>,
  IntersectAllValidatorOutputs<TMethodMiddlewares, TValidator>
>

export interface ServerRouteMethodHandlerCtx<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> {
  data: Expand<
    IntersectAllMethodValidatorOutputs<
      TMiddlewares,
      TMethodMiddlewares,
      TValidator
    >
  >
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
    undefined,
    undefined
  >
  handler: (
    handler: ServerRouteMethodHandlerFn<
      TPath,
      TVerb,
      TMiddlewares,
      undefined,
      undefined
    >,
  ) => ServerRouteMethodBuilderAfterHandler<
    TPath,
    TVerb,
    TMiddlewares,
    undefined,
    undefined
  >
}

export interface ServerRouteMethodBuilderAfterHandler<
  TPath extends string,
  TVerb extends ServerRouteVerb,
  TMiddlewares,
  TMethodMiddlewares,
  TValidator,
> extends ServerRouteMethodsBuilderWithTypes<
    TPath,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  > {
  opts: ServerRouteMethod<
    TPath,
    TVerb,
    TMiddlewares,
    TMethodMiddlewares,
    TValidator
  >
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
