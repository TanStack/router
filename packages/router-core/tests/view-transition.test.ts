import { afterEach, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function createRouter() {
  const root = new BaseRootRoute({})
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const next = new BaseRoute({ getParentRoute: () => root, path: '/next' })
  return createTestRouter({
    routeTree: root.addChildren([index, next]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    defaultViewTransition: true,
    isServer: false,
  })
}

test('navigation handles skipped view transition promises', async () => {
  const catches: Array<ReturnType<typeof vi.spyOn>> = []
  const startViewTransition = vi.fn((update: () => Promise<void>) => {
    const skipped = () => {
      const promise = Promise.reject(
        new DOMException('Transition was skipped', 'AbortError'),
      )
      // Keep the regression run safe while observing the router's own handlers.
      void promise.catch(() => {})
      catches.push(vi.spyOn(promise, 'catch'))
      return promise
    }
    return {
      ready: skipped(),
      finished: skipped(),
      updateCallbackDone: update(),
    }
  })
  vi.stubGlobal('document', { startViewTransition })
  const router = createRouter()
  await router.load()
  await router.navigate({ to: '/next' })

  expect(router.state.location.pathname).toBe('/next')
  expect(startViewTransition).toHaveBeenCalled()
  for (const caught of catches) {
    expect(caught).toHaveBeenCalledWith(expect.any(Function))
  }
})

test('view transitions support missing optional promises', async () => {
  vi.stubGlobal('document', {
    startViewTransition: (update: () => Promise<void>) => ({
      updateCallbackDone: update(),
    }),
  })
  const router = createRouter()
  await router.navigate({ to: '/next' })
  expect(router.state.location.pathname).toBe('/next')
})

test('view transitions preserve the update callback promise and its rejection', async () => {
  const error = new Error('update failed')
  const updateCallbackDone = Promise.reject(error)
  const rejected = expect(updateCallbackDone).rejects.toBe(error)
  vi.stubGlobal('document', {
    startViewTransition: () => ({ updateCallbackDone }),
  })
  expect(createRouter().startViewTransition(async () => {})).toBe(
    updateCallbackDone,
  )
  await rejected
})
