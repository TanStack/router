import {
  createNullProtoObject,
  safeObjectMerge,
} from '@tanstack/start-client-core'
import { getStartEvent } from '../internal-request-response'
import { executeMiddleware, getResponseFromResult } from '../request-middleware'
import { getOriginalServerFn } from './middlewareMocks'
import { getScope } from './scope'
import { getMiddlewareType } from './types'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  Method,
  ServerFnMeta,
} from '@tanstack/start-client-core'
import type { PipelineContext } from '../request-middleware'
import type { TestRequestScope } from './scope'
import type {
  AnyMiddleware,
  ContextOption,
  MiddlewareInputContext,
  MiddlewareOutputContext,
  MiddlewareSendContext,
} from './types'

type DataOption<TData> = undefined extends TData
  ? { data?: TData }
  : { data: TData }

/** What a function middleware's server function is called with. */
export type FunctionMiddlewareInput<TMiddleware extends AnyFunctionMiddleware> =
  DataOption<TMiddleware['~types']['allOutput']> &
    ContextOption<MiddlewareInputContext<TMiddleware>> & {
      /** Defaults to `GET`. */
      method?: Method
      serverFnMeta?: ServerFnMeta
    }

/** What a function middleware passed to `next()`. */
export interface FunctionMiddlewarePassed<
  TMiddleware extends AnyFunctionMiddleware,
> {
  /** The context the middleware received, with what it added. */
  context: MiddlewareOutputContext<TMiddleware>
  /** What the middleware sends back to the client. */
  sendContext: MiddlewareSendContext<TMiddleware>
}

/** How a function middleware's server function ended. */
export interface FunctionMiddlewareRun<
  TMiddleware extends AnyFunctionMiddleware,
  TResult,
> extends FunctionMiddlewarePassed<TMiddleware> {
  /** What the `next` callback of the test returned. */
  result: TResult
}

/** What a request middleware's server function is called with. */
export type RequestMiddlewareInput<TMiddleware extends AnyRequestMiddleware> =
  ContextOption<MiddlewareInputContext<TMiddleware>> & {
    /** Defaults to `router`, a request for a page. */
    handlerType?: 'router' | 'serverFn'
    serverFnMeta?: ServerFnMeta
  }

/** What a request middleware passed to `next()`. */
export interface RequestMiddlewarePassed<
  TMiddleware extends AnyRequestMiddleware,
> {
  /** The context the middleware received, with what it added. */
  context: MiddlewareOutputContext<TMiddleware>
  request: Request
  pathname: string
}

/** How a request middleware's server function ended. */
export interface RequestMiddlewareRun<
  TMiddleware extends AnyRequestMiddleware,
> {
  /**
   * The context the middleware passed on. It is the context the middleware
   * received when the middleware did not call `next()`.
   */
  context: MiddlewareOutputContext<TMiddleware>
  /**
   * The response the middleware answers the request with: its own, or the
   * one that came back from `next()`.
   */
  response: Response
}

type AnyFn = (...args: Array<any>) => any

const defaultServerFnMeta: ServerFnMeta = {
  id: 'runMiddleware',
  name: 'runMiddleware',
  filename: 'runMiddleware',
}

async function runFunctionMiddleware(
  scope: TestRequestScope,
  server: AnyFn,
  input: {
    data?: unknown
    context?: Record<string, unknown>
    method?: Method
    serverFnMeta?: ServerFnMeta
  },
  next: AnyFn | undefined,
) {
  const options = {
    data: input.data,
    context: createNullProtoObject(input.context),
    method: input.method ?? 'GET',
    serverFnMeta: input.serverFnMeta ?? defaultServerFnMeta,
    request: scope.request,
  }
  const returned = await server({
    ...options,
    next: async (
      nextOptions: {
        context?: Record<string, unknown>
        sendContext?: unknown
      } = {},
    ) => {
      const context = safeObjectMerge(options.context, nextOptions.context)
      const sendContext = nextOptions.sendContext
      const result = await next?.({ context, sendContext })
      return { ...options, ...nextOptions, context, sendContext, result }
    },
  })

  if (returned instanceof Response) {
    return {
      context: options.context,
      sendContext: undefined,
      result: returned,
    }
  }
  if (!returned) {
    throw new Error(
      'runMiddleware(): the middleware returned nothing. A middleware returns the result of next().',
    )
  }
  return {
    context: returned.context,
    sendContext: returned.sendContext,
    result: returned.result,
  }
}

async function runRequestMiddleware(
  scope: TestRequestScope,
  server: AnyFn,
  input: {
    context?: Record<string, unknown>
    handlerType?: 'router' | 'serverFn'
    serverFnMeta?: ServerFnMeta
  },
  next: AnyFn | undefined,
) {
  const { request, pathname } = scope
  const pipeline: PipelineContext = {
    request,
    pathname,
    handlerType: input.handlerType ?? 'router',
    serverFnMeta: input.serverFnMeta,
    context: createNullProtoObject(input.context),
  }
  // The request middleware pipeline of the app, with the middleware alone and
  // the test's `next` in place of everything after it.
  const result = await executeMiddleware(
    [server],
    async ({ context }: PipelineContext) => {
      const response: unknown = await next?.({ context, request, pathname })
      return response instanceof Response ? response : new Response(null)
    },
    pipeline,
    request.signal,
    getStartEvent(),
  )
  return {
    context: pipeline.context,
    response: getResponseFromResult(result) as Response,
  }
}

/**
 * Calls the server function of one middleware, and nothing else: not the
 * middleware it lists itself, not its validator, not its client function.
 * Use it inside `runInRequest`, which provides the request.
 *
 * `input` is what the middleware receives: for a function middleware the
 * validated `data` and the `context` of the middleware before it, for a
 * request middleware the `context`.
 *
 * `next` stands for everything after the middleware. It gets what the
 * middleware passed on. What it returns is the result of the call for a
 * function middleware, and the response of the request for a request
 * middleware.
 */
export function runMiddleware<
  TMiddleware extends AnyFunctionMiddleware,
  TResult = undefined,
>(
  middleware: TMiddleware,
  input: FunctionMiddlewareInput<TMiddleware>,
  next?: (
    passed: FunctionMiddlewarePassed<TMiddleware>,
  ) => TResult | Promise<TResult>,
): Promise<FunctionMiddlewareRun<TMiddleware, TResult>>
export function runMiddleware<TMiddleware extends AnyRequestMiddleware>(
  middleware: TMiddleware,
  input: RequestMiddlewareInput<TMiddleware>,
  next?: (
    passed: RequestMiddlewarePassed<TMiddleware>,
  ) => Response | void | Promise<Response | void>,
): Promise<RequestMiddlewareRun<TMiddleware>>
export async function runMiddleware(
  middleware: AnyMiddleware,
  input: Record<string, any>,
  next?: AnyFn,
): Promise<unknown> {
  const type = getMiddlewareType(middleware)
  if (!type) {
    throw new Error(
      'runMiddleware() needs a middleware created with createMiddleware().',
    )
  }
  const scope = getScope()
  if (!scope) {
    throw new Error(
      'runMiddleware() has to be called inside runInRequest(), which provides the request the middleware runs for.',
    )
  }
  const server = getOriginalServerFn(middleware)
  if (!server) {
    throw new Error(
      'runMiddleware(): the middleware has no server function. Only a function passed to .server() can be run.',
    )
  }
  return type === 'function'
    ? runFunctionMiddleware(scope, server, input, next)
    : runRequestMiddleware(scope, server, input, next)
}
