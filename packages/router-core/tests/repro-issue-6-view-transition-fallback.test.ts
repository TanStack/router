import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * Issue 6: object-form view transitions should fall back to the normal browser
 * startViewTransition API when typed transition selectors are unsupported.
 * Returning fn() directly disables the transition even though the browser can
 * still perform an untyped view transition.
 *
 * This test navigates through the public router API with object-form
 * viewTransition options. The mocked browser reports no typed-transition
 * support, but still provides document.startViewTransition, so navigation should
 * call startViewTransition with a regular update callback.
 */

type ViewTransitionInput =
  | (() => Promise<void>)
  | { update: () => Promise<void>; types?: Array<string> }

type DocumentWithViewTransition = Document & {
  startViewTransition?: (input: ViewTransitionInput) => {
    ready: Promise<void>
    finished: Promise<void>
    updateCallbackDone: Promise<void>
    skipTransition: () => void
  }
}

let startViewTransitionDescriptor:
  | PropertyDescriptor
  | undefined
let startViewTransitionMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  startViewTransitionDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'startViewTransition',
  )
  startViewTransitionMock = vi.fn((input: ViewTransitionInput) => {
    const update = typeof input === 'function' ? input : input.update
    const updateCallbackDone = Promise.resolve()
      .then(update)
      .then(() => undefined)

    return {
      ready: Promise.resolve(),
      finished: updateCallbackDone,
      updateCallbackDone,
      skipTransition: vi.fn(),
    }
  })

  vi.stubGlobal('CSS', {
    supports: vi.fn(() => false),
  })
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: startViewTransitionMock,
  })
})

afterEach(() => {
  if (startViewTransitionDescriptor) {
    Object.defineProperty(
      document,
      'startViewTransition',
      startViewTransitionDescriptor,
    )
  } else {
    delete (document as DocumentWithViewTransition).startViewTransition
  }

  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('view transition fallback', () => {
  test('uses document.startViewTransition for object-form transitions when typed transitions are unsupported', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const nextRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/next',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, nextRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()
    await router.navigate({
      to: '/next',
      viewTransition: { types: ['route-change'] },
    })

    expect(startViewTransitionMock).toHaveBeenCalledTimes(1)
    expect(startViewTransitionMock).toHaveBeenCalledWith(expect.any(Function))
    expect(router.state.location.pathname).toBe('/next')
  })
})
