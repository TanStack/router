import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import { makeHooksRouter, navigateIdentities } from '../_fixtures/hooks.tsrx'

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

// Hook parity — per react-router's useMatch.tsx (nearest-match via matchContext,
// strict params), route.tsx (Route/getRouteApi hook accessors), useLoaderDeps,
// useRouteContext, Matches.tsx (useParentMatches/useChildMatches), useNavigate
// (stable identity), useCanGoBack.
describe('@tanstack/octane-router — hooks', () => {
  it('a LAYOUT with no `from` resolves the NEAREST match, not the leaf', async () => {
    const router = makeHooksRouter('/items/i7?tab=specs')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // Strict params at the layout level: the layout route defines no params,
    // so its own (nearest) match yields {} — NOT the leaf's { id: 'i7' }.
    expect(r.find('.layout-params').textContent).toBe('{}')
    expect(r.find('.layout-route').textContent).toBe('/items')
    // The leaf still sees its own params.
    expect(r.find('.item-params').textContent).toBe('{"id":"i7"}')
    r.unmount()
  })

  it('Route.useLoaderData / useLoaderDeps / useRouteContext read the match', async () => {
    const router = makeHooksRouter('/items/i7?tab=specs')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.item-loader').textContent).toBe('loaded-i7')
    expect(r.find('.item-deps').textContent).toBe('{"tab":"specs"}')
    expect(r.find('.item-context').textContent).toBe('ctx-value')
    r.unmount()
  })

  it('useMatches / useParentMatches / useChildMatches slice the match chain', async () => {
    const router = makeHooksRouter('/items/i7')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // Chain: __root__ > /items > /items/$id — the leaf sees 3 matches, 2
    // parents, 0 children.
    expect(r.find('.item-counts').textContent).toBe('3/2/0')
    r.unmount()
  })

  it('getRouteApi(id) hooks read the route match by id', async () => {
    const router = makeHooksRouter('/items/summary/i9')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.api-summary').textContent).toBe('sum-i9:i9')
    r.unmount()
  })

  it('useCanGoBack is false on the first entry and true after navigating', async () => {
    const router = makeHooksRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.find('.can-go-back').textContent).toBe('false')

    await router.navigate({ to: '/items/i7' })
    await flush()
    await router.navigate({ to: '/' })
    await flush()
    expect(r.find('.can-go-back').textContent).toBe('true')
    r.unmount()
  })

  it('useNavigate returns a stable function across re-renders', async () => {
    const router = makeHooksRouter('/search?q=a')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.find('.search').textContent).toBe('{"q":"a"}')

    // Same-route search change re-renders SearchPage.
    await router.navigate({ to: '/search', search: { q: 'b' } })
    await flush()
    expect(r.find('.search').textContent).toBe('{"q":"b"}')

    expect(navigateIdentities.length).toBeGreaterThanOrEqual(2)
    const first = navigateIdentities[0]
    expect(navigateIdentities.every((f) => f === first)).toBe(true)
    r.unmount()
  })

  it('validateSearch runs (defaults applied) — search middleware path', async () => {
    const router = makeHooksRouter('/search')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.find('.search').textContent).toBe('{"q":""}')
    r.unmount()
  })
})
