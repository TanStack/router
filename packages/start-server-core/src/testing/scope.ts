import { AsyncLocalStorage } from 'node:async_hooks'
import type { AnyMiddleware } from './types'

type AnyFn = (...args: Array<any>) => any

/** A mock that `mockMiddleware` registered. */
export interface ActiveMiddlewareMock {
  mock: AnyFn
  ran: boolean
  /** Created where the mock was registered, so its stack points there. */
  neverRan: Error
}

export type MiddlewareMocks = Map<AnyMiddleware, ActiveMiddlewareMock>

/** What the helpers of a test share while `runInRequest` runs. */
export interface TestRequestScope {
  request: Request
  pathname: string
  /** The mocks registered inside this scope. They end with it. */
  mocks: MiddlewareMocks
  /** Set when `runInRequest` has settled. */
  closed?: boolean
}

const scopes = new AsyncLocalStorage<TestRequestScope>()

export function runWithScope<T>(scope: TestRequestScope, fn: () => T): T {
  return scopes.run(scope, fn)
}

/** The request scope that code runs in, until `runInRequest` settles. */
export function getScope(): TestRequestScope | undefined {
  const scope = scopes.getStore()
  return scope?.closed ? undefined : scope
}
