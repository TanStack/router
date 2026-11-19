import { MockRegistry } from './mockStores'
import type { MockOwner } from './mockStores'
import type { FetcherBase, Method } from '../createServerFn'

/**
 * Answers for the server function calls of client tests.
 *
 * A client test has no server. So when a test runner compiles a project, the
 * client code of a server function gets the `createClientRpc` of
 * `./createClientRpc` instead of the one that sends a request. That one asks
 * this module for the answer a test registered with `mockServerFn`, and fails
 * when there is none.
 */

/** What a mock gets of a server function call. */
export interface ServerFnMockContext<TData> {
  /**
   * The `data` of the call, as the caller passed it. The function's validator
   * has not run: it runs on the server, which the mock stands for.
   */
  data: TData
  method: Method
  /** The headers of the call, with what the function's client middleware added. */
  headers: Headers
  signal: AbortSignal | undefined
}

/** A server function as client code has it. */
export type AnyClientServerFn = FetcherBase &
  ((...args: Array<any>) => Promise<unknown>)

/** The `data` a server function is called with. */
export type ServerFnMockData<TServerFn> = TServerFn extends (
  options: infer TOptions,
  ...args: Array<any>
) => unknown
  ? 'data' extends keyof NonNullable<TOptions>
    ? NonNullable<TOptions>['data']
    : undefined
  : never

/**
 * Stands for everything of a server function that runs on the server: its
 * server middleware, its validator and its handler. It returns what the call
 * resolves to, or throws what the call rejects with.
 */
export type ServerFnMock<TServerFn extends AnyClientServerFn> = (
  ctx: ServerFnMockContext<ServerFnMockData<TServerFn>>,
) => Awaited<ReturnType<TServerFn>> | Promise<Awaited<ReturnType<TServerFn>>>

type AnyServerFnMock = (ctx: ServerFnMockContext<any>) => unknown

declare module 'vitest' {
  interface TestContext {
    /**
     * `mockServerFn` for this test. The mock ends with this test also when
     * other tests run concurrently, in every test environment.
     */
    mockServerFn: <TServerFn extends AnyClientServerFn>(
      serverFn: TServerFn,
      mock: ServerFnMock<TServerFn>,
    ) => void
    /** `resetServerFnMocks` for this test: removes the mocks of this test. */
    resetServerFnMocks: () => void
  }
}

/** The ids of the server functions that were compiled for this client test. */
const clientRpcIds = new Set<string>()
const mocks = new MockRegistry<string, AnyServerFnMock>()

/**
 * Answers the calls of a server function in a client test. A mock that a test
 * or a `beforeEach` hook registers ends with that test; one from the top of
 * the file or from `beforeAll` stays for the file. The mock is typed from the
 * server function: it gets the `data` the function is called with, and
 * returns what the function's handler returns.
 *
 * The function's client middleware runs as in the app. The mock is called
 * where the app would send the request.
 *
 * Tests that run concurrently in browser mode use the `mockServerFn` of their
 * test context instead, so that each mock ends with its own test.
 */
export function mockServerFn<TServerFn extends AnyClientServerFn>(
  serverFn: TServerFn,
  mock: ServerFnMock<TServerFn>,
): void {
  registerServerFnMock(serverFn, mock, undefined)
}

/** @internal `mockServerFn` for a given test: the one of the test context. */
export function registerServerFnMock<TServerFn extends AnyClientServerFn>(
  serverFn: TServerFn,
  mock: ServerFnMock<TServerFn>,
  owner: MockOwner | undefined,
): void {
  const id = (serverFn as { serverFnMeta?: { id?: string } }).serverFnMeta?.id
  if (id === undefined || !clientRpcIds.has(id)) {
    throw new Error(
      'mockServerFn() needs a server function that the Start compiler compiled for a client test: ' +
        'one created with createServerFn().handler(), imported in a test that runs in a browser, in jsdom or in happy-dom, ' +
        "with Start's plugin in the test runner's config. " +
        'In a server test a server function runs for real and has no request to answer.',
    )
  }
  mocks.set(id, mock as AnyServerFnMock, owner)
}

/**
 * Removes the mocks of `mockServerFn` now: the ones of the running test when
 * it is called in a test, the ones of the file otherwise. Mocks end with
 * their test anyway, so this is only for removing them earlier.
 */
export function resetServerFnMocks(): void {
  mocks.clear()
}

/** @internal `resetServerFnMocks` for a given test: the one of the test context. */
export function resetServerFnMocksOf(owner: MockOwner): void {
  mocks.clear(owner)
}

/** Called by the `createClientRpc` of a test run for each function it creates. */
export function registerClientRpc(id: string): void {
  clientRpcIds.add(id)
}

/**
 * Called by the `createClientRpc` of a test run in place of the request.
 * Resolves to what the response of the server would be read as.
 */
export async function callServerFnMock(
  id: string,
  call: {
    data?: unknown
    method: Method
    headers?: HeadersInit
    signal?: AbortSignal
  },
): Promise<{ result: unknown }> {
  const mock = mocks.get(id)
  if (!mock) {
    throw new Error(
      `The server function ${describeServerFn(id)} was called in a client test, where no server runs. ` +
        'Answer the call with mockServerFn() before it is made.',
    )
  }
  return {
    result: await mock({
      data: call.data,
      method: call.method,
      headers: new Headers(call.headers),
      signal: call.signal,
    }),
  }
}

/**
 * The name and the file of a server function, read from its id. The compiler
 * of a dev server or a test run encodes both in the id.
 */
function describeServerFn(id: string): string {
  try {
    const bytes = Uint8Array.from(
      atob(id.replace(/-/g, '+').replace(/_/g, '/')),
      (char) => char.charCodeAt(0),
    )
    const { file, export: exportName } = JSON.parse(
      new TextDecoder().decode(bytes),
    ) as { file: string; export: string }
    return `"${exportName.replace(/_createServerFn_handler$/, '')}" (${file.replace(/\?.*$/, '')})`
  } catch {
    return `with the id "${id}"`
  }
}
