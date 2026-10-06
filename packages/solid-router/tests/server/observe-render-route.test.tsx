// Observe tier, server: the provider declares the route the render resolved
// to with the same `OBSERVE.attribution.withOrigin` call the client makes at
// its initial match, and the request's `"render"` record carries it as
// `RenderEvent.route` — the name a consumer gives the request (`http.route`)
// where the URL would scatter one page across as many names as it has
// parameters. There is no attribution engine on the server; the declaration
// is the whole of what the call does there.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OBSERVE } from 'solid-js'
import { renderToStream, renderToString } from '@solidjs/web'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../../src'
import type { RenderEvent } from '@solidjs/web'

vi.mock('@tanstack/router-core/isServer', async (importOriginal) => ({
  ...(await importOriginal()),
  isServer: undefined,
}))

const unsubscribes: Array<() => void> = []
afterEach(() => {
  for (const off of unsubscribes.splice(0)) off()
})

function renders(): Array<RenderEvent> {
  const seen: Array<RenderEvent> = []
  unsubscribes.push(
    OBSERVE!.records.subscribe('render', (event) => seen.push(event)),
  )
  return seen
}

function makeRouter(url: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div data-route="home">Home</div>,
  })
  const userRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/users/$id',
    loader: ({ params }) => Promise.resolve({ name: `user ${params.id}` }),
    component: () => {
      const data = userRoute.useLoaderData()
      return <div data-route="user">{data().name}</div>
    },
  })
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute, userRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
    isServer: true,
  })
}

describe("observe tier, server: RenderEvent.route from the provider's initial match", () => {
  it.each([false, true])(
    "the location's route names the render (loaded before the render: %s)",
    async (preloaded) => {
      const seen = renders()
      const router = makeRouter('/users/7?tab=posts')
      if (preloaded) await router.load()
      const html = await renderToStream(() => (
        <RouterProvider router={router} />
      ))
      expect(html).toContain('user 7')
      expect(seen).toHaveLength(1)
      // The path and search, as `@solidjs/router` names a render (a request
      // carries no hash).
      expect(seen[0]!.route).toEqual({
        name: '/users/$id',
        to: '/users/7?tab=posts',
        params: { id: '7' },
      })
    },
  )

  it("the root route is named '/'", async () => {
    const seen = renders()
    const router = makeRouter('/')
    await router.load()
    await renderToString(() => <RouterProvider router={router} />)
    expect(seen[0]!.route).toEqual({ name: '/', to: '/' })
  })

  it('a not-found is named by its pathname', async () => {
    const seen = renders()
    const router = makeRouter('/nope/deeper')
    await router.load()
    await renderToString(() => <RouterProvider router={router} />)
    expect(seen[0]!.route).toEqual({ name: '/nope/deeper', to: '/nope/deeper' })
  })
})
