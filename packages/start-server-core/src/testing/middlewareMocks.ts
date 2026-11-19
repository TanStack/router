import { MockRegistry } from '@tanstack/start-client-core/testing'
import { getScope } from './scope'
import { getMiddlewareType } from './types'
import type {
  AnyFunctionMiddleware,
  AnyRequestMiddleware,
  Method,
  ServerFnMeta,
} from '@tanstack/start-client-core'
import type { ActiveMiddlewareMock, MiddlewareMocks } from './scope'
import type {
  AnyMiddleware,
  ContextOption,
  MiddlewareAddedContext,
  MiddlewareInputContext,
  MiddlewareMockContext,
  MiddlewareSendContext,
} from './types'

/**
 * Mocks for middleware in server tests.
 *
 * `mockMiddleware` swaps the server and the client function of a middleware
 * object for dispatchers, once. A dispatcher calls the mock that is active
 * for the middleware, or the original function when there is none. Nothing
 * of this is in the code an app ships.
 */

declare const middlewareMockResult: unique symbol

/**
 * What `next()` resolves to in a mock. A mock returns it to let the call go
 * on, as a middleware returns the result of its `next()`.
 */
export interface MiddlewareMockResult {
  readonly [middlewareMockResult]: true
}

/** What a mock passes to `next()`: what the mocked middleware passes. */
export type MiddlewareMockNextOptions<TMiddleware extends AnyMiddleware> =
  ContextOption<MiddlewareAddedContext<TMiddleware>> &
    (TMiddleware extends AnyFunctionMiddleware
      ? { sendContext?: MiddlewareSendContext<TMiddleware> }
      : {})

/**
 * `next()` of a mock. Its `context` is required when the mocked middleware
 * adds context, because the code after it relies on that context.
 */
export type MiddlewareMockNext<TMiddleware extends AnyMiddleware> =
  undefined extends MiddlewareAddedContext<TMiddleware>
    ? (
        options?: MiddlewareMockNextOptions<TMiddleware>,
      ) => Promise<MiddlewareMockResult>
    : (
        options: MiddlewareMockNextOptions<TMiddleware>,
      ) => Promise<MiddlewareMockResult>

/** What the mock of a function middleware gets: what the middleware gets. */
export interface FunctionMiddlewareMockOptions<
  TMiddleware extends AnyFunctionMiddleware,
> {
  data: TMiddleware['~types']['allOutput']
  /** Without what the middleware's own client function sends: it does not run. */
  context: MiddlewareMockContext<TMiddleware>
  next: MiddlewareMockNext<TMiddleware>
  method: Method
  serverFnMeta: ServerFnMeta
}

/** What the mock of a request middleware gets: what the middleware gets. */
export interface RequestMiddlewareMockOptions<
  TMiddleware extends AnyRequestMiddleware,
> {
  request: Request
  pathname: string
  context: MiddlewareInputContext<TMiddleware>
  next: MiddlewareMockNext<TMiddleware>
  handlerType: 'serverFn' | 'router'
  serverFnMeta?: ServerFnMeta
}

/**
 * Stands for the server function of a middleware. It gets what the
 * middleware gets. It goes on by returning `next()`, with the context the
 * middleware adds, or it ends the call the way the middleware can: by
 * throwing, or (a request middleware) by returning a `Response`.
 */
export type MiddlewareMock<TMiddleware extends AnyMiddleware> =
  TMiddleware extends AnyFunctionMiddleware
    ? (
        options: FunctionMiddlewareMockOptions<TMiddleware>,
      ) => MiddlewareMockResult | Promise<MiddlewareMockResult>
    : TMiddleware extends AnyRequestMiddleware
      ? (
          options: RequestMiddlewareMockOptions<TMiddleware>,
        ) =>
          | MiddlewareMockResult
          | Response
          | Promise<MiddlewareMockResult | Response>
      : never

type AnyFn = (...args: Array<any>) => any

/** The mocks registered outside a request scope: of a test, or of the file. */
const testMocks = new MockRegistry<AnyMiddleware, ActiveMiddlewareMock>()
/** The functions a middleware had before its dispatchers went in. */
const originals = new WeakMap<
  AnyMiddleware,
  { server?: AnyFn; client?: AnyFn }
>()

function activeMock(
  middleware: AnyMiddleware,
): ActiveMiddlewareMock | undefined {
  return getScope()?.mocks.get(middleware) ?? testMocks.get(middleware)
}

function installDispatchers(middleware: AnyMiddleware) {
  if (originals.has(middleware)) {
    return
  }
  const options = middleware.options as { server?: AnyFn; client?: AnyFn }
  const original = { server: options.server, client: options.client }
  originals.set(middleware, original)

  options.server = (serverOptions) => {
    const active = activeMock(middleware)
    if (active) {
      active.ran = true
      return active.mock(serverOptions)
    }
    return original.server
      ? original.server(serverOptions)
      : serverOptions.next()
  }
  // A mocked middleware is out of the way as a whole. On the server a call
  // runs the client function first, and that function can need a browser.
  const client = original.client
  if (client) {
    options.client = (clientOptions) =>
      activeMock(middleware) ? clientOptions.next() : client(clientOptions)
  }
}

/**
 * Replaces a middleware in server tests. The mock is typed from the
 * middleware: it gets what the middleware's server function gets, and it
 * passes on the context that function passes on. While a middleware is
 * mocked, its client function does not run either.
 *
 * A mock registered inside `runInRequest` belongs to that request: it wins
 * over a mock of the test, ends with the request, and the request fails when
 * the mock never ran. A mock registered in a test or in `beforeEach` ends
 * with the test. One registered at the top of the file or in `beforeAll`
 * stays for the file.
 */
export function mockMiddleware<TMiddleware extends AnyMiddleware>(
  middleware: TMiddleware,
  mock: MiddlewareMock<TMiddleware>,
): void {
  if (!getMiddlewareType(middleware)) {
    throw new Error(
      'mockMiddleware() needs a middleware created with createMiddleware().',
    )
  }
  installDispatchers(middleware)
  ;(getScope()?.mocks ?? testMocks).set(middleware, {
    mock: mock as AnyFn,
    ran: false,
    neverRan: new Error(
      'A middleware was mocked inside runInRequest() and did not run in that request. Either nothing in the request used it after the mock was registered ' +
        '(the request middleware of src/start.ts has run before the callback starts: mock it before runInRequest()), ' +
        'or the server ran another copy of it: the server loads the file of a server function a second time, ' +
        'so a middleware that is created in that file exists twice. Create the middleware in a file of its own to mock it.',
    ),
  })
}

/** The server function a middleware was created with, mocked or not. */
export function getOriginalServerFn(
  middleware: AnyMiddleware,
): AnyFn | undefined {
  const original = originals.get(middleware)
  return original
    ? original.server
    : (middleware.options as { server?: AnyFn }).server
}

/** Throws for a mock of a request scope that never ran. */
export function assertMocksRan(mocks: MiddlewareMocks): void {
  for (const active of mocks.values()) {
    if (!active.ran) {
      throw active.neverRan
    }
  }
}
