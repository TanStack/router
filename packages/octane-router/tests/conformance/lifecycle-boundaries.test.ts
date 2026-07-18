import { describe, it, expect, vi } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import {
  makeLifecycleRouter,
  createDeferred,
  setThrow,
} from '../_fixtures/lifecycle.tsrx'

async function flush() {
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

// Router event lifecycle + resolvedLocation commit — per react-router's
// Transitioner.tsx (onLoad/onBeforeRouteMount/onResolved + status idle +
// resolvedLocation) and Match.tsx OnRendered (onRendered after the subtree
// below the root layout commits).
describe('@tanstack/octane-router — event lifecycle', () => {
  it('emits onLoad → onBeforeRouteMount → onResolved → onRendered on navigation', async () => {
    const router = makeLifecycleRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    const events: string[] = []
    const unsubs = [
      'onLoad',
      'onBeforeRouteMount',
      'onResolved',
      'onRendered',
    ].map((type) => router.subscribe(type, () => events.push(type)))

    await router.navigate({ to: '/plain' })
    await flush()

    expect(events).toContain('onLoad')
    expect(events).toContain('onBeforeRouteMount')
    expect(events).toContain('onResolved')
    expect(events).toContain('onRendered')
    // onResolved resolves the navigation before the rendered notification.
    expect(events.indexOf('onLoad')).toBeLessThan(events.indexOf('onResolved'))
    expect(events.indexOf('onResolved')).toBeLessThan(
      events.indexOf('onRendered'),
    )

    unsubs.forEach((u) => u())
    r.unmount()
  })

  it('commits resolvedLocation and returns status to idle after a navigation', async () => {
    const router = makeLifecycleRouter('/')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(router.state.resolvedLocation?.pathname).toBe('/')

    await router.navigate({ to: '/plain' })
    await flush()

    expect(router.state.location.pathname).toBe('/plain')
    expect(router.state.resolvedLocation?.pathname).toBe('/plain')
    expect(router.state.status).toBe('idle')
    r.unmount()
  })
})

// Error boundaries in the match pipeline — per react-router's Match.tsx
// (ResolvedCatchBoundary) + CatchBoundary.tsx.
describe('@tanstack/octane-router — route error boundaries', () => {
  it('renders the route errorComponent when the route component throws', async () => {
    setThrow(true)
    const router = makeLifecycleRouter('/boom')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.route-error').length).toBe(1)
    expect(r.find('.route-error').textContent).toBe('route error: boom')
    // The root layout stays up — the boundary is scoped to the match.
    expect(r.findAll('.root').length).toBe(1)
    r.unmount()
  })

  it('falls back to defaultErrorComponent when the route has none', async () => {
    setThrow(true)
    const router = makeLifecycleRouter('/boom', {
      routeError: false,
      defaultError: true,
    })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.default-error').length).toBe(1)
    expect(r.find('.default-error').textContent).toBe('default error: boom')
    r.unmount()
  })

  it('renders the generic ErrorComponent via the global boundary when no route boundary exists', async () => {
    setThrow(true)
    const router = makeLifecycleRouter('/boom', { routeError: false })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // Upstream's global CatchBoundary (Matches.tsx) renders the generic
    // ErrorComponent ("Something went wrong!").
    expect(r.container.textContent).toContain('Something went wrong!')
    expect(r.container.textContent).toContain('boom')
    r.unmount()
  })

  it('calls onCatch with the error (route-level wins over defaultOnCatch)', async () => {
    setThrow(true)
    const onCatch = vi.fn()
    const defaultOnCatch = vi.fn()
    const router = makeLifecycleRouter('/boom', { onCatch, defaultOnCatch })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // Transitioner's mount-time load may roll loadedAt and reset the boundary,
    // re-catching the still-throwing component — upstream recatches the same
    // way (getDerivedStateFromProps clears on resetKey change), so assert
    // "called with the error", not an exact count.
    expect(onCatch).toHaveBeenCalled()
    expect(onCatch.mock.calls[0][0].message).toBe('boom')
    expect(defaultOnCatch).not.toHaveBeenCalled()
    r.unmount()
  })

  it('resets the boundary when the router reloads (loadedAt reset key)', async () => {
    setThrow(true)
    const router = makeLifecycleRouter('/boom')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.route-error').length).toBe(1)

    // Fix the component, then invalidate — loadedAt changes, the boundary
    // resets, and the recovered body renders (upstream
    // getDerivedStateFromProps resetKey behavior).
    setThrow(false)
    await router.invalidate()
    await flush()

    expect(r.findAll('.route-error').length).toBe(0)
    expect(r.findAll('.boom-ok').length).toBe(1)
    r.unmount()
  })
})

// Loader-driven pending + render-thrown notFound + defaultComponent — per
// react-router's MatchInner.
describe('@tanstack/octane-router — match status handling', () => {
  it('shows the pendingComponent while a slow loader is in flight, then the content', async () => {
    const deferred = createDeferred<string>()
    const router = makeLifecycleRouter('/', { deferred })
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()
    expect(r.findAll('.home').length).toBe(1)

    // Navigate WITHOUT awaiting — the loader hangs on the deferred; after
    // pendingMs (1ms) router-core promotes the pending match and MatchInner
    // suspends on its loadPromise → the route's pendingComponent shows.
    router.navigate({ to: '/slow-loader' })
    await flush()

    expect(r.findAll('.loader-pending').length).toBe(1)
    expect(r.findAll('.loader-done').length).toBe(0)

    deferred.resolve('data')
    await flush()

    expect(r.findAll('.loader-done').length).toBe(1)
    expect(r.findAll('.loader-pending').length).toBe(0)
    r.unmount()
  })

  it('a notFound() thrown during RENDER is caught and renders the route notFoundComponent', async () => {
    const router = makeLifecycleRouter('/nf-render')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.nf-render').length).toBe(1)
    expect(r.find('.nf-render').textContent).toBe('nf in render')
    r.unmount()
  })

  it('renders router.options.defaultComponent for a route without a component', async () => {
    const router = makeLifecycleRouter('/plain-default')
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    expect(r.findAll('.default-comp').length).toBe(1)
    r.unmount()
  })
})

// Scroll restoration actually RESTORES now that onRendered fires (router-core's
// setupScrollRestoration listens for it).
describe('@tanstack/octane-router — scroll restoration restore', () => {
  it('invokes window.scrollTo on navigation via the onRendered event', async () => {
    const scrollTo = vi.fn()
    ;(window as any).scrollTo = scrollTo

    const router = makeLifecycleRouter('/')
    router.options.scrollRestoration = true
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    scrollTo.mockClear()
    await router.navigate({ to: '/plain' })
    await flush()

    // Restoring to a never-visited location scrolls to top — the call itself
    // proves the onRendered-driven restore path runs.
    expect(scrollTo).toHaveBeenCalled()
    r.unmount()
  })
})
