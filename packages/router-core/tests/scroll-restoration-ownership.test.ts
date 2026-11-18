import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import { BaseRootRoute, disposeRouter, setupScrollRestoration } from '../src'
import { createTestRouter } from './routerTestUtils'

// Kept in its own file: the manual-mode owner count is module state, and
// routers from other test files are never disposed.

afterEach(() => {
  history.scrollRestoration = 'auto'
  vi.restoreAllMocks()
})

function createRouter(scrollRestoration = true) {
  return createTestRouter({
    history: createMemoryHistory(),
    routeTree: new BaseRootRoute({}),
    scrollRestoration,
  })
}

test('restores the prior native scroll restoration mode when the only router is disposed', () => {
  history.scrollRestoration = 'auto'
  const router = createRouter()
  expect(history.scrollRestoration).toBe('manual')
  disposeRouter(router)
  expect(history.scrollRestoration).toBe('auto')

  history.scrollRestoration = 'manual'
  const manualRouter = createRouter()
  disposeRouter(manualRouter)
  expect(history.scrollRestoration).toBe('manual')
})

test('keeps manual mode while another router still uses scroll restoration', () => {
  history.scrollRestoration = 'auto'
  const first = createRouter()
  const second = createRouter()
  disposeRouter(first)
  expect(history.scrollRestoration).toBe('manual')
  disposeRouter(second)
  expect(history.scrollRestoration).toBe('auto')
})

test('a cleanup from an earlier setup does not tear down a later forced setup', () => {
  history.scrollRestoration = 'auto'
  const router = createRouter(false)
  const earlierCleanup = setupScrollRestoration(router, false)
  const activeCleanup = setupScrollRestoration(router, true)
  expect(activeCleanup).not.toBe(earlierCleanup)
  expect(router.subscribers.size).toBe(2)

  const removeSpy = vi.spyOn(document, 'removeEventListener')
  earlierCleanup!()
  expect(removeSpy).not.toHaveBeenCalled()
  expect(router.subscribers.size).toBe(2)
  expect(router._scroll.c).toBe(activeCleanup)
  expect(history.scrollRestoration).toBe('manual')

  disposeRouter(router)
  expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function), true)
  expect(router.subscribers.size).toBe(0)
  expect(router._scroll.c).toBeUndefined()
  expect(history.scrollRestoration).toBe('auto')
})
