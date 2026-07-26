import { describe, it, expect } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import {
  makeLazyRouter,
  makeAwaitRouter,
  makeExternalAwaitRouter,
  makeScrollRouter,
} from '../_fixtures/features.tsrx'

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

describe('@tanstack/octane-router — lazy routes / Await / scroll restoration', () => {
  it('lazyRouteComponent: a route component is loaded lazily, then rendered', async () => {
    const router = makeLazyRouter()
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush() // the dynamic import resolves + the boundary re-renders

    expect(r.findAll('.lazy').length).toBe(1)
    expect(r.find('.lazy').textContent).toBe('Lazy loaded')
    r.unmount()
  })

  it('Await: suspends on a deferred promise then renders the streamed value', async () => {
    const router = makeAwaitRouter()
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // the render-prop's JSX rendering the resolved value proves use(promise)
    // suspended then resumed (and that render-prop children compile)
    expect(r.findAll('.await-resolved').length).toBe(1)
    expect(r.find('.await-resolved').textContent).toBe('streamed')
    r.unmount()
  })

  it('Await: treats a frozen router-owned promise as externally hydrated', async () => {
    const router = makeExternalAwaitRouter()
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.find('.external-await-resolved').textContent).toBe(
      'externally hydrated',
    )
    r.unmount()
  })

  it('scrollRestoration option: mounts + navigation still works', async () => {
    const router = makeScrollRouter()
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.scroll-home').length).toBe(1)

    await router.navigate({ to: '/next' })
    await flush()
    expect(r.findAll('.scroll-next').length).toBe(1)
    r.unmount()
  })
})
