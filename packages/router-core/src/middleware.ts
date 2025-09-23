// NOTE: We copied these for now. Probably sharable, or at least
// can be reduced for this use case

import type { AnyRoute } from './route'
import type { Assign } from './utils'

export type ResolveAllServerContext<
  TParentRoute extends AnyRoute,
  TMiddlewares,
> = unknown extends TParentRoute
  ? AssignAllServerContext<TMiddlewares>
  : Assign<
      TParentRoute['types']['allServerContext'],
      AssignAllServerContext<TMiddlewares>
    >

/**
 * Recursively resolve the server context type produced by a sequence of middleware
 */
export type AssignAllServerContext<
  TMiddlewares,
  TServerContext = undefined,
> = Assign<
  AssignAllMiddleware<TMiddlewares, 'allServerContext'>,
  TServerContext
>

export type AssignAllMiddleware<
  TMiddlewares,
  TType extends keyof AnyRequestMiddleware['_types'],
  TAcc = undefined,
> = TMiddlewares extends readonly [infer TMiddleware, ...infer TRest]
  ? TMiddleware extends AnyRequestMiddleware
    ? AssignAllMiddleware<
        TRest,
        TType,
        Assign<TAcc, TMiddleware['_types'][TType & keyof TMiddleware['_types']]>
      >
    : TAcc
  : TAcc

export type AnyRequestMiddleware = RequestMiddlewareWithTypes<any, any>

export interface RequestMiddlewareWithTypes<TMiddlewares, TServerContext> {
  _types: RequestMiddlewareTypes<TMiddlewares, TServerContext>
  options: RequestMiddlewareOptions<TMiddlewares, TServerContext>
}

export interface RequestMiddlewareTypes<TMiddlewares, TServerContext> {
  type: 'request'
  middlewares: TMiddlewares
  serverContext: TServerContext
  allServerContext: AssignAllServerContext<TMiddlewares, TServerContext>
}

export interface RequestMiddlewareOptions<
  in out TMiddlewares,
  in out TServerContext,
> {
  middleware?: TMiddlewares
  // server?: RequestServerFn<TMiddlewares, TServerContext>
}

// export type RequestServerFn<TMiddlewares, TServerContext> = (
//   options: RequestServerOptions<TMiddlewares>,
// ) => RequestMiddlewareServerFnResult<TMiddlewares, TServerContext>

// export interface RequestServerOptions<TMiddlewares> {
//   request: Request
//   pathname: string
//   context: AssignAllServerContext<TMiddlewares>
//   next: RequestServerNextFn<TMiddlewares>
// }

// export type RequestServerNextFn<TMiddlewares> = <TServerContext = undefined>(
//   options?: RequestServerNextFnOptions<TServerContext>,
// ) => RequestMiddlewareServerFnResult<TMiddlewares, TServerContext>

// export interface RequestServerNextFnOptions<TServerContext> {
//   context?: TServerContext
// }

// export type RequestMiddlewareServerFnResult<TMiddlewares, TServerContext> =
//   | Promise<RequestServerResult<TMiddlewares, TServerContext>>
//   | RequestServerResult<TMiddlewares, TServerContext>

// export interface RequestServerResult<TMiddlewares, TServerContext> {
//   request: Request
//   pathname: string
//   context: Expand<AssignAllServerContext<TMiddlewares, TServerContext>>
//   response: Response
// }
