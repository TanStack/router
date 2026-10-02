import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createAtom } from '@tanstack/vue-store'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type * as VueStore from '@tanstack/vue-store'

vi.mock('@tanstack/vue-store', async (importOriginal) => {
  const original = await importOriginal<typeof VueStore>()
  return { ...original, createAtom: vi.fn(original.createAtom) }
})

beforeEach(() => {
  vi.mocked(createAtom).mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

test.each(['production', 'development', 'test'] as const)(
  'server matches do not allocate reactive presentation locations in %s',
  async (environment) => {
    vi.stubEnv('NODE_ENV', environment)
    const root = createRootRoute({ component: () => Vue.h(Outlet) })
    const route = createRoute({
      getParentRoute: () => root,
      path: '/server/$id',
      component: () =>
        Vue.h(
          Link,
          { to: '/server/$id', params: true, search: true },
          () => 'server',
        ),
    })
    const history = createMemoryHistory({
      initialEntries: ['/server/first?visit=3'],
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: true,
    })
    const initialLocation = router.state.location
    const locationAllocations = (location: typeof initialLocation) =>
      vi
        .mocked(createAtom)
        .mock.calls.filter(
          ([value]) => value === initialLocation || value === location,
        ).length
    // Vue already creates the global location atom on the server. A match's
    // context needs only router and route ID; it must add no location atom.
    const initialAllocations = locationAllocations(initialLocation)
    expect(initialAllocations).toBe(1)
    try {
      await router.load()
      const renderedLocation = router.state.location
      const html = await renderToString(
        Vue.createSSRApp(() => Vue.h(RouterProvider, { router })),
      )
      expect(html).toContain('href="/server/first?visit=3"')
      expect(locationAllocations(renderedLocation)).toBe(initialAllocations)
    } finally {
      history.destroy()
    }
  },
)
