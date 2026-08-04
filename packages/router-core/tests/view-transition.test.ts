import { afterEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const originalStartViewTransition = Object.getOwnPropertyDescriptor(
  document,
  'startViewTransition',
)

type Deferred = {
  promise: Promise<void>
  reject: (reason: unknown) => void
}

function createDeferred(): Deferred {
  let reject!: (reason: unknown) => void
  const promise = new Promise<void>((_, rejectPromise) => {
    reject = rejectPromise
  })
  return { promise, reject }
}

function createRouter() {
  const rootRoute = new BaseRootRoute({})
  return createTestRouter({
    routeTree: rootRoute,
    history: createMemoryHistory(),
    defaultViewTransition: true,
  })
}

function installViewTransition({
  ready,
  finished,
}: {
  ready: Promise<void>
  finished: Promise<void>
}) {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => Promise<void>) => {
      const updateCallbackDone = Promise.resolve().then(update)
      return {
        ready,
        finished,
        updateCallbackDone,
        skipTransition() {},
      } as ViewTransition
    },
  })
}

function installCallbackPropagatingViewTransition() {
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (update: () => Promise<void>) => {
      const updateCallbackDone = Promise.resolve().then(update)
      return {
        updateCallbackDone,
        ready: updateCallbackDone.then(() => undefined),
        finished: updateCallbackDone.then(() => undefined),
        skipTransition() {},
      } as ViewTransition
    },
  })
}

afterEach(() => {
  if (originalStartViewTransition) {
    Object.defineProperty(
      document,
      'startViewTransition',
      originalStartViewTransition,
    )
  } else {
    Reflect.deleteProperty(document, 'startViewTransition')
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('view transition lifecycle rejections', () => {
  test('ignores an invalid-state ready rejection and reports an unexpected finished rejection', async () => {
    const ready = createDeferred()
    const finished = createDeferred()
    const unexpectedError = new Error('unexpected finished failure')
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    installViewTransition({
      ready: ready.promise,
      finished: finished.promise,
    })

    createRouter().startViewTransition(async () => {})

    ready.reject(
      new DOMException(
        'Transition was aborted because of invalid state',
        'InvalidStateError',
      ),
    )
    finished.reject(unexpectedError)
    await Promise.allSettled([ready.promise, finished.promise])

    expect(reportError).toHaveBeenCalledExactlyOnceWith(unexpectedError)
  })

  test('reports an unexpected ready rejection and ignores an aborted finished rejection', async () => {
    const ready = createDeferred()
    const finished = createDeferred()
    const unexpectedError = new Error('unexpected ready failure')
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    installViewTransition({
      ready: ready.promise,
      finished: finished.promise,
    })

    createRouter().startViewTransition(async () => {})

    ready.reject(unexpectedError)
    finished.reject(new DOMException('Aborted', 'AbortError'))
    await Promise.allSettled([ready.promise, finished.promise])

    expect(reportError).toHaveBeenCalledExactlyOnceWith(unexpectedError)
  })

  test('falls back to console.error when reportError is unavailable', async () => {
    const ready = createDeferred()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('reportError', undefined)
    installViewTransition({
      ready: ready.promise,
      finished: Promise.resolve(),
    })

    createRouter().startViewTransition(async () => {})

    const unexpectedError = new Error('unexpected ready failure')
    ready.reject(unexpectedError)
    await Promise.allSettled([ready.promise])

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(unexpectedError)
  })

  test('reports a rejected update callback once without an unhandled rejection', async () => {
    const unexpectedError = new Error('unexpected update callback failure')
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    installCallbackPropagatingViewTransition()

    createRouter().startViewTransition(async () => {
      throw unexpectedError
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reportError).toHaveBeenCalledExactlyOnceWith(unexpectedError)
  })

  test.each([
    new DOMException('Aborted by the update callback', 'AbortError'),
    new DOMException(
      'Transition was aborted because of invalid state',
      'InvalidStateError',
    ),
  ])('reports an %s thrown by the update callback', async (unexpectedError) => {
    const reportError = vi.fn()
    vi.stubGlobal('reportError', reportError)
    installViewTransition({
      ready: Promise.resolve(),
      finished: Promise.resolve(),
    })

    createRouter().startViewTransition(async () => {
      throw unexpectedError
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(reportError).toHaveBeenCalledExactlyOnceWith(unexpectedError)
  })
})
