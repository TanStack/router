import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import { makeRouter as makeTsrx } from '../_fixtures/basic.tsrx'
import { makeRouter as makeTsx } from '../_fixtures/basic-react.tsx'

async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

// The identical router app authored two ways — `.tsrx` directives vs React-style
// `.tsx` — must produce identical behavior. Same assertions, both dialects.
describe.each([
  ['tsrx', makeTsrx],
  ['tsx', makeTsx],
])('JSX backwards-compat parity: %s', (_name, makeRouter) => {
  it('renders the index, navigates via Link, reflects active state', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.index').length).toBe(1)
    expect(r.find('.nav-home').getAttribute('data-status')).toBe('active')

    r.click('.nav-about')
    await flush()

    expect(r.findAll('.about').length).toBe(1)
    expect(r.findAll('.index').length).toBe(0)
    expect(router.state.location.pathname).toBe('/about')
    expect(r.find('.nav-about').getAttribute('data-status')).toBe('active')
    r.unmount()
  })

  it('reads a path param via useParams', async () => {
    const router = makeRouter('/item/7')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.item').textContent).toBe('Item 7')
    r.unmount()
  })
})
