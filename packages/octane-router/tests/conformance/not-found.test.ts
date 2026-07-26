import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import { makeRouter } from '../_fixtures/not-found.tsrx'

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

// TanStack Router not-found semantics (per @tanstack/react-router's Outlet /
// MatchInner / renderRouteNotFound):
// - An unknown URL flags ONE match `globalNotFound` — with the default
//   `notFoundMode: 'fuzzy'` the deepest fuzzy-matched route that HAS children,
//   with `notFoundMode: 'root'` the root. That match still renders its own
//   component (the layout); its <Outlet/> renders the not-found UI instead of a
//   child match.
// - The rendered component resolves route `notFoundComponent` →
//   router `defaultNotFoundComponent` → TanStack's generic `<p>Not Found</p>`.
// - A loader/beforeLoad that throws `notFound()` resolves the boundary in
//   router-core (`status: 'notFound'` on the boundary match) and the
//   NotFoundError is spread onto the component (`data` prop).
describe('@tanstack/octane-router not-found', () => {
  it('an unknown URL renders the root notFoundComponent inside the root layout', async () => {
    const router = makeRouter('/definitely/not/a/page')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root').length).toBe(1) // layout chrome stays up
    expect(r.findAll('.root-notfound').length).toBe(1) // 404 in its Outlet
    expect(r.find('.root-notfound').textContent).toBe('Root not found')
    expect(r.findAll('.index').length).toBe(0)
    r.unmount()
  })

  it('falls back to the router defaultNotFoundComponent when the route has none', async () => {
    const router = makeRouter('/nope', {
      rootNotFound: false,
      defaultNotFound: true,
    })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.default-notfound').length).toBe(1)
    r.unmount()
  })

  it('falls back to the generic <p>Not Found</p> when nothing is configured', async () => {
    const router = makeRouter('/nope', { rootNotFound: false })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.root').textContent).toBe('Not Found')
    expect(r.find('.root').querySelector('p')).not.toBe(null)
    r.unmount()
  })

  it('fuzzy mode (default) 404s at the nearest matched route with children', async () => {
    const router = makeRouter('/posts/nope', { postsNotFound: true })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.posts').length).toBe(1) // posts layout renders too
    expect(r.findAll('.posts-notfound').length).toBe(1) // 404 in ITS Outlet
    expect(r.findAll('.posts-index').length).toBe(0)
    expect(r.findAll('.root-notfound').length).toBe(0) // root 404 not used
    r.unmount()
  })

  it("notFoundMode: 'root' 404s at the root even for a nested unknown URL", async () => {
    const router = makeRouter('/posts/nope', {
      postsNotFound: true,
      notFoundMode: 'root',
    })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root-notfound').length).toBe(1)
    expect(r.findAll('.posts').length).toBe(0) // root's Outlet short-circuits
    r.unmount()
  })

  it("a loader's notFound() renders the route's notFoundComponent with its data", async () => {
    const router = makeRouter('/item/missing')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.item').length).toBe(0) // route component replaced
    expect(r.find('.item-notfound').textContent).toBe('Missing item missing')
    r.unmount()
  })

  it('navigating unknown → known clears the not-found UI (and back again)', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.index').length).toBe(1)

    await router.navigate({ to: '/definitely/not/a/page' })
    await flush()
    expect(r.findAll('.root-notfound').length).toBe(1)
    expect(r.findAll('.index').length).toBe(0)

    await router.navigate({ to: '/' })
    await flush()
    expect(r.findAll('.root-notfound').length).toBe(0)
    expect(r.findAll('.index').length).toBe(1)
    r.unmount()
  })
})
