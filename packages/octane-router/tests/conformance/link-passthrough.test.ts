import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import {
  makeRouter,
  resetUserClickCount,
  userClickCount,
} from '../_fixtures/link-passthrough.tsrx'

// router-core resolves matches asynchronously — flush a few cycles + paints (same
// shape as router.test.ts).
async function flush() {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

describe('@tanstack/octane-router <Link> arbitrary prop pass-through', () => {
  it('forwards data-*/aria-*/title/id onto the <a> while keeping href + active state', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    const a = r.find('.nav-home') as HTMLAnchorElement

    // Pass-through props land on the anchor (React-router parity).
    expect(a.getAttribute('data-testid')).toBe('lk')
    expect(a.getAttribute('aria-label')).toBe('go')
    expect(a.getAttribute('title')).toBe('t')
    expect(a.getAttribute('id')).toBe('home-link')

    // Routing props are untouched: correct href + active reflection.
    expect(a.getAttribute('href')).toBe('/')
    expect(a.getAttribute('data-status')).toBe('active')
    expect(a.getAttribute('aria-current')).toBe('page')

    const activeLinkBefore = r.find('.nav-active') as HTMLAnchorElement
    expect(activeLinkBefore.className).toContain('nav-active')
    expect(activeLinkBefore.className).toContain('is-inactive')

    // User onClick handlers are composed before navigation.
    resetUserClickCount()
    r.click('.nav-click')
    await flush()
    expect(userClickCount).toBe(1)
    expect(router.state.location.pathname).toBe('/about')

    // Routing still works: a click navigates and flips active state.
    expect(r.findAll('.about').length).toBe(1)
    expect(r.find('.nav-home').getAttribute('data-status')).toBe(null)
    const activeLinkAfter = r.find('.nav-active') as HTMLAnchorElement
    expect(activeLinkAfter.className).toContain('is-active')
    expect(activeLinkAfter.getAttribute('data-extra')).toBe('active-extra')
    r.unmount()
  })

  it('does not intercept reloadDocument or disabled links', async () => {
    const router = makeRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    r.click('.nav-reload')
    await flush()
    expect(router.state.location.pathname).toBe('/')

    const disabled = r.find('.nav-disabled') as HTMLAnchorElement
    expect(disabled.getAttribute('aria-disabled')).toBe('true')
    r.click('.nav-disabled')
    await flush()
    expect(router.state.location.pathname).toBe('/')
    r.unmount()
  })
})
