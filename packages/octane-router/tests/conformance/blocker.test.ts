import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import { makeBlockerRouter, blockerState } from '../_fixtures/blocker.tsrx'

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

// useBlocker/Block + useMatchRoute/MatchRoute + ClientOnly — per react-router's
// useBlocker.tsx, Matches.tsx and ClientOnly.tsx.
describe('@tanstack/octane-router — navigation blocking + match utilities', () => {
  it('useBlocker(withResolver) blocks navigation until proceed() is called', async () => {
    const router = makeBlockerRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.guarded').textContent).toBe('status:idle:true')

    // Navigate — the blocker parks the navigation and flips to 'blocked'.
    router.navigate({ to: '/other' })
    await flush()
    expect(r.find('.guarded').textContent).toBe('status:blocked:true')
    expect(router.state.location.pathname).toBe('/')

    // proceed() releases the navigation.
    blockerState.resolver.proceed()
    await flush()
    expect(router.state.location.pathname).toBe('/other')
    expect(r.findAll('.other').length).toBe(1)
    r.unmount()
  })

  it('reset() cancels the blocked navigation and stays put', async () => {
    const router = makeBlockerRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    router.navigate({ to: '/other' })
    await flush()
    expect(r.find('.guarded').textContent).toBe('status:blocked:true')

    blockerState.resolver.reset()
    await flush()
    expect(router.state.location.pathname).toBe('/')
    expect(r.find('.guarded').textContent).toBe('status:idle:true')
    r.unmount()
  })

  it('MatchRoute renders children when matched (element and render-prop forms)', async () => {
    const router = makeBlockerRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.mr-home').length).toBe(1)
    // Render-prop child ALWAYS renders, receiving false when unmatched.
    expect(r.find('.mr-other').textContent).toBe('other:false')
    r.unmount()
  })

  it('ClientOnly renders children on the client (fallback is for SSR)', async () => {
    const router = makeBlockerRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.co-content').length).toBe(1)
    expect(r.findAll('.co-fallback').length).toBe(0)
    r.unmount()
  })
})
