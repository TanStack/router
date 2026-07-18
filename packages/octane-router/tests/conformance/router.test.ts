import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import { makeRouter } from '../_fixtures/basic.tsrx'

// router-core resolves matches asynchronously (load/navigate return promises) and
// the store notifications drive octane re-renders on a macrotask — flush a few
// cycles + paints, the same shape the query binding tests use.
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

describe('@tanstack/octane-router core seam', () => {
  it('renders the matched route through the layout Outlet', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root').length).toBe(1) // root layout rendered
    expect(r.findAll('.index').length).toBe(1) // index child via <Outlet/>
    expect(r.find('.index').textContent).toBe('Index')
    expect(router.state.location.pathname).toBe('/')
    r.unmount()
  })

  it('navigation swaps the Outlet content + updates location', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.index').length).toBe(1)

    await router.navigate({ to: '/about' })
    await flush()

    expect(r.findAll('.about').length).toBe(1) // about now rendered
    expect(r.findAll('.index').length).toBe(0) // index unmounted
    expect(r.findAll('.root').length).toBe(1) // layout stayed mounted
    expect(router.state.location.pathname).toBe('/about')
    r.unmount()
  })

  it('a Link click navigates and reflects active state', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.nav-home').getAttribute('data-status')).toBe('active')
    expect(r.find('.nav-about').getAttribute('data-status')).toBe(null)

    r.click('.nav-about') // delegated onClick → preventDefault → router.navigate
    await flush()

    expect(r.findAll('.about').length).toBe(1)
    expect(router.state.location.pathname).toBe('/about')
    expect(r.find('.nav-about').getAttribute('data-status')).toBe('active')
    expect(r.find('.nav-home').getAttribute('data-status')).toBe(null)
    r.unmount()
  })

  it('useParams reads a path param', async () => {
    const router = makeRouter('/item/42')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.item').textContent).toBe('Item 42')
    expect(router.state.location.pathname).toBe('/item/42')
    r.unmount()
  })

  it('nested routes render through a chain of Outlets', async () => {
    const router = makeRouter('/posts')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.root').length).toBe(1) // root layout (Outlet #1)
    expect(r.findAll('.posts').length).toBe(1) // posts layout (Outlet #2)
    expect(r.findAll('.posts-index').length).toBe(1) // posts index (3rd match)
    r.unmount()
  })
})
