import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  AssignAllServerFnContext,
  AssignAllServerRequestContext,
  FunctionMiddlewareWithTypes,
  RequestMiddlewareWithTypes,
} from '@tanstack/start-client-core'
import type { Expand } from '@tanstack/router-core'

export type AnyMiddleware = AnyFunctionMiddleware | AnyRequestMiddleware

/**
 * The context a middleware's server function receives: what the server entry,
 * the global middleware and the middleware before it passed on.
 */
export type MiddlewareInputContext<TMiddleware> =
  TMiddleware extends FunctionMiddlewareWithTypes<
    infer TRegister,
    infer TMiddlewares,
    any,
    any,
    infer TServerSendContext,
    any,
    any
  >
    ? Expand<
        AssignAllServerFnContext<TRegister, TMiddlewares, TServerSendContext>
      >
    : TMiddleware extends RequestMiddlewareWithTypes<
          infer TRegister,
          infer TMiddlewares,
          any
        >
      ? Expand<AssignAllServerRequestContext<TRegister, TMiddlewares>>
      : never

/**
 * The context the mock of a middleware receives: what the middleware's
 * server function receives, without what its own client function sends. A
 * mocked middleware's client function does not run.
 */
export type MiddlewareMockContext<TMiddleware> =
  TMiddleware extends FunctionMiddlewareWithTypes<
    infer TRegister,
    infer TMiddlewares,
    any,
    any,
    any,
    any,
    any
  >
    ? Expand<AssignAllServerFnContext<TRegister, TMiddlewares>>
    : MiddlewareInputContext<TMiddleware>

/** The context a middleware's server function passes to `next()`. */
export type MiddlewareAddedContext<TMiddleware extends AnyMiddleware> =
  TMiddleware['~types']['serverContext']

/** The context after a middleware: what it received and what it added. */
export type MiddlewareOutputContext<TMiddleware extends AnyMiddleware> = Expand<
  TMiddleware['~types']['allServerContext']
>

/** What a function middleware's server function sends back to the client. */
export type MiddlewareSendContext<TMiddleware extends AnyFunctionMiddleware> =
  TMiddleware['~types']['clientSendContext']

/** `{ context }`, required when the context has a required property. */
export type ContextOption<TContext> = undefined extends TContext
  ? { context?: TContext }
  : {} extends TContext
    ? { context?: TContext }
    : { context: TContext }

/**
 * The kind of a middleware, read from the object at runtime. The types of a
 * middleware do not declare `options.type`.
 */
export function getMiddlewareType(
  middleware: unknown,
): 'function' | 'request' | undefined {
  const type = (middleware as { options?: { type?: unknown } } | undefined)
    ?.options?.type
  return type === 'function' || type === 'request' ? type : undefined
}
