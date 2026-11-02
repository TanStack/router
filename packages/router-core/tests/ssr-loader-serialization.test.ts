import { createMemoryHistory } from '@tanstack/history'
import { expect, onTestFinished, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import { createTestRouter } from './routerTestUtils'

for (const title of [
  'Serializable loader data',
  () => 'Serializable loader data',
]) {
  test(`SSR serialization ${typeof title === 'function' ? 'rejects a plain function' : 'accepts its string result'}`, async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    onTestFinished(() => errors.mockRestore())
    const rootRoute = new BaseRootRoute({})
    const route = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      loader: () => ({ title }),
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([route]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer: true,
    })
    attachRouterServerSsrUtils({ router, manifest: undefined })
    onTestFinished(() => router.serverSsr?.cleanup())
    await router.load()
    await router.serverSsr!.dehydrate()
    if (typeof title === 'function') {
      expect(errors).toHaveBeenCalledWith(
        'Serialization error:',
        expect.any(Error),
      )
    } else {
      expect(errors).not.toHaveBeenCalled()
    }
  })
}
