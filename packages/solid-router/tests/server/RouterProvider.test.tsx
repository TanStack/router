import { describe, expect, it, vi } from 'vitest'
import { renderToStream } from '@solidjs/web'
import { isServer } from '@tanstack/router-core/isServer'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

describe('RouterProvider (development SSR)', () => {
  it('creates a server router before request history is attached', () => {
    expect(isServer).toBeUndefined()

    const router = createRouter({ routeTree: createRootRoute() })

    expect(router.isServer).toBe(true)
    const history = createMemoryHistory({ initialEntries: ['/'] })
    router.update({ history })
    expect(router.history).toBe(history)
    expect(router.stores.matches.get()).toEqual([])
  })

  it.each([false, true])(
    'loads once and serializes matches when preloaded is %s',
    async (preloaded) => {
      expect(isServer).toBeUndefined()

      const loader = vi.fn(() => Promise.resolve('server-loader-data'))
      const rootRoute = createRootRoute()
      const indexRoute = createRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        loader,
        component: () => <div>Index</div>,
      })
      const router = createRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })
      const loadSpy = vi.spyOn(router, 'load')

      if (preloaded) {
        await router.load()
      }

      const html = await renderToStream(() => (
        <RouterProvider router={router} />
      ))

      expect(loadSpy).toHaveBeenCalledTimes(1)
      expect(loader).toHaveBeenCalledTimes(1)
      expect(html).toContain('Index')
      expect(html).toContain('tsr:__root__')
      expect(html).toContain('tsr:/')
      expect(html).toContain('server-loader-data')
      loadSpy.mockRestore()
    },
  )
})
