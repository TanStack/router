import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@solidjs/testing-library'
import { REVALIDATE_HEADER } from '@solidjs/web'
import {
  REDIRECT_HEADER,
  getFlightDataConsumer,
} from '@solidjs/web/server-functions'
import {
  Outlet,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import { RouterProvider } from '../src/RouterProvider'
import { applyResponseMetadata } from '../src/flightData'

// The router is the transport's unnamed single-flight consumer: whatever a
// mutation's response says about the page — redirect here, this data went
// stale — the router applies. These tests drive the registered consumer the
// way the transport does (`consumer(data, { response })`) with the response
// metadata Solid's helpers produce, so they cover the router's half
// independently of the transport version installed.

function redirectResponse(url: string, status = 302) {
  // The scripted transport masks a redirect as a 200 carrying
  // `<status> <absolute url>` — the browser would otherwise follow the 3xx
  // before script could see it.
  return new Response(null, {
    status: 200,
    headers: { [REDIRECT_HEADER]: `${status} ${url}` },
  })
}

// `reload({ revalidate })` / `respond(value, { revalidate })`. A bare
// `reload()` sets no header at all — on the wire it is `return null`, and
// the transport never delivers it to consumers (its meaning is the host's
// default, which under this router is "nothing declared").
function reloadResponse(keys: string) {
  return new Response(null, {
    status: 200,
    headers: { [REVALIDATE_HEADER]: keys },
  })
}

function setup() {
  const loads = { root: 0, index: 0, after: 0 }
  const rootRoute = createRootRoute({
    loader: () => {
      loads.root++
    },
    component: () => (
      <div>
        <Outlet />
      </div>
    ),
  })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => {
      loads.index++
    },
    component: () => <div>Index</div>,
  })
  const afterRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/after',
    loader: () => {
      loads.after++
    },
    component: () => <div>After</div>,
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, afterRoute]),
    history,
    // Long enough that nothing reloads on its own — a rerun is the
    // invalidation's doing, not staleness.
    defaultStaleTime: 60_000,
  })
  return { router, history, loads }
}

async function mount(router: ReturnType<typeof setup>['router']) {
  const app = render(() => <RouterProvider router={router} />)
  await app.findByText('Index')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  return app
}

describe('server-function response metadata', () => {
  afterEach(() => {
    cleanup()
    // the provider unsubscribes on cleanup; nothing may leak between tests
    expect(getFlightDataConsumer()).toBeUndefined()
  })

  it('registers the router as the unnamed consumer while mounted', async () => {
    const { router } = setup()
    expect(getFlightDataConsumer()).toBeUndefined()
    const app = await mount(router)
    expect(getFlightDataConsumer()).toBeTypeOf('function')
    app.unmount()
    expect(getFlightDataConsumer()).toBeUndefined()
  })

  it('a same-origin redirect navigates under the router, replacing the entry', async () => {
    const { router, history, loads } = setup()
    const app = await mount(router)
    expect(loads).toEqual({ root: 1, index: 1, after: 0 })
    const depth = history.length

    await getFlightDataConsumer()!(undefined, {
      response: redirectResponse(`${window.location.origin}/after?tab=1#top`),
    })

    await app.findByText('After')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(router.state.location.pathname).toBe('/after')
    expect(router.state.location.searchStr).toBe('?tab=1')
    expect(router.state.location.hash).toBe('top')
    // replace: the destination takes the submission's place in history
    expect(history.length).toBe(depth)
    // the destination's data loads, and the shared layout's data reloads:
    // the mutation is a write, so the root's data is invalid too — but
    // each exactly once, in the one load that commits the destination
    expect(loads).toEqual({ root: 2, index: 1, after: 1 })
  })

  it('a redirect to another origin leaves the app through the router', async () => {
    const { router, loads } = setup()
    await mount(router)
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(undefined)
    const invalidate = vi.spyOn(router, 'invalidate')

    await getFlightDataConsumer()!(undefined, {
      response: redirectResponse('https://accounts.example.com/login?next=1'),
    })

    // a full url makes `navigate` reload the document (through the router,
    // so its protocol allowlist and blockers still apply); nothing of this
    // page is reloaded on the way out
    expect(navigate).toHaveBeenCalledWith({
      href: 'https://accounts.example.com/login?next=1',
      replace: true,
    })
    expect(invalidate).not.toHaveBeenCalled()
    expect(loads).toEqual({ root: 1, index: 1, after: 0 })
  })

  it('reload({ revalidate }) reruns the current route data in place', async () => {
    const { router, history, loads } = setup()
    await mount(router)
    const depth = history.length

    await getFlightDataConsumer()!(undefined, {
      response: reloadResponse('todos'),
    })

    await waitFor(() => expect(loads).toEqual({ root: 2, index: 2, after: 0 }))
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(router.state.location.pathname).toBe('/')
    expect(history.length).toBe(depth)
  })

  it('respond(value, { revalidate }) reruns route data — the keys belong to other caches', async () => {
    const { router, loads } = setup()
    await mount(router)

    // The value rides to the caller through the transport; the router has
    // no keyed cache, so the names are for a query client's consumer, and
    // the router's answer is that a write happened.
    await getFlightDataConsumer()!(undefined, {
      response: new Response(JSON.stringify({ id: 7 }), {
        status: 201,
        headers: { [REVALIDATE_HEADER]: 'todos,stats' },
      }),
    })

    await waitFor(() => expect(loads).toEqual({ root: 2, index: 2, after: 0 }))
    await waitFor(() => expect(router.state.status).toBe('idle'))
  })

  it("'*' reruns route data like any declaration of a write", async () => {
    const { router, loads } = setup()
    await mount(router)

    await getFlightDataConsumer()!(undefined, { response: reloadResponse('*') })

    await waitFor(() => expect(loads).toEqual({ root: 2, index: 2, after: 0 }))
    await waitFor(() => expect(router.state.status).toBe('idle'))
  })

  it('an empty declaration reloads nothing', async () => {
    const { router, loads } = setup()
    await mount(router)
    const invalidate = vi.spyOn(router, 'invalidate')

    // `reload({ revalidate: [] })`: the author narrowed the scope to zero
    // keys — distinct from a bare `reload()`, whose absent header is the
    // host default.
    await getFlightDataConsumer()!(undefined, { response: reloadResponse('') })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(invalidate).not.toHaveBeenCalled()
    expect(loads).toEqual({ root: 1, index: 1, after: 0 })
  })

  it('a redirect with an empty declaration navigates without reloading shared layouts', async () => {
    const { router, loads } = setup()
    const app = await mount(router)

    await getFlightDataConsumer()!(undefined, {
      response: new Response(null, {
        headers: {
          [REDIRECT_HEADER]: `302 ${window.location.origin}/after`,
          [REVALIDATE_HEADER]: '',
        },
      }),
    })

    await app.findByText('After')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    expect(router.state.location.pathname).toBe('/after')
    // the destination loads because it is new; the root is within its
    // staleTime and was not declared stale
    expect(loads).toEqual({ root: 1, index: 1, after: 1 })
  })

  it('a response without metadata changes nothing', async () => {
    const { router, loads } = setup()
    await mount(router)
    const navigate = vi.spyOn(router, 'navigate')
    const invalidate = vi.spyOn(router, 'invalidate')

    // A plain `respond(value, { status: 201 })` — the value is the
    // caller's; an authored `Location` on a non-redirect status is data.
    applyResponseMetadata(
      router,
      new Response(null, { status: 201, headers: { Location: '/created' } }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(navigate).not.toHaveBeenCalled()
    expect(invalidate).not.toHaveBeenCalled()
    expect(loads).toEqual({ root: 1, index: 1, after: 0 })
  })

  it('a malformed redirect carrier is ignored, not followed', async () => {
    const { router, loads } = setup()
    await mount(router)
    const navigate = vi.spyOn(router, 'navigate')

    // `decodeRedirectHeaderValue` refuses anything but an absolute http(s)
    // target on a redirect status — a hostile peer cannot ride
    // `javascript:` into a navigation.
    applyResponseMetadata(
      router,
      new Response(null, {
        headers: { [REDIRECT_HEADER]: '302 javascript:alert(1)' },
      }),
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(navigate).not.toHaveBeenCalled()
    expect(loads).toEqual({ root: 1, index: 1, after: 0 })
  })
})
