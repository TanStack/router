// The setup file Start's plugin adds to a Vitest run. It tells the mocks of
// `mockServerFn` and `mockMiddleware` which test runs, so that each mock ends
// with the test that registered it (./mockStores.ts).
import { aroundEach, beforeEach } from 'vitest'
import { endTest, setAsyncOwnerSource, startTest } from './mockStores'
import { registerServerFnMock, resetServerFnMocksOf } from './serverFnMocks'

/** `AsyncLocalStorage`, where the test runs in Node (also jsdom, happy-dom). */
async function loadAsyncLocalStorage() {
  try {
    const { AsyncLocalStorage } = await import('node:async_hooks')
    return AsyncLocalStorage
  } catch {
    // (browser mode: the module is a stub that throws when it is read)
    return undefined
  }
}

const AsyncLocalStorage = await loadAsyncLocalStorage()
if (AsyncLocalStorage) {
  const tests = new AsyncLocalStorage<object>()
  setAsyncOwnerSource(() => tests.getStore())
  aroundEach((runTest, context) => tests.run(context.task, runTest))
}

beforeEach((context) => {
  const owner = context.task
  startTest(owner)
  // (the hook of the test context: Vitest's global hooks do not know which of
  // several concurrent tests finished)
  context.onTestFinished(() => endTest(owner))
  context.mockServerFn = (serverFn, mock) =>
    registerServerFnMock(serverFn, mock, owner)
  context.resetServerFnMocks = () => resetServerFnMocksOf(owner)
})
