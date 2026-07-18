import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, nextPaint } from '../_helpers'
import { RouterProvider } from '@tanstack/octane-router'
import {
  makeSameRouteSearchRouter,
  deferredFor,
  resetDeferreds,
} from '../_fixtures/same-route-search.tsrx'

// router-core resolves matches asynchronously and store notifications drive
// octane re-renders on a macrotask — flush a few cycles + paints, the same shape
// the other router tests use.
async function flush() {
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 0))
    await nextPaint()
  }
}

describe('@tanstack/octane-router — same-route search-param navigation (concurrent hold)', () => {
  // The Octane router drives navigation state commits through octane's
  // startTransition (Transitioner.tsrx). Cross-route navigation already holds the
  // previous view while the next route suspends. This test covers the SAME-route
  // `?page` change: the route component reads `useSearch` and renders a child that
  // `use(deferredFor(page))`s, so changing `?page=1` → `?page=2` re-suspends.
  //
  // To exercise the bug deterministically we enable view transitions (a supported
  // router option) and supply a `document.startViewTransition` that runs its
  // update callback on a later task — exactly as a real browser does. router-core
  // commits the RESOLVED matches inside `startViewTransition(fn)`, so `fn` runs
  // AFTER octane's navigation-transition window has closed. Without the fix that
  // resolved `__store`/match commit schedules an URGENT re-render of the
  // suspending route component, and an urgent suspend does NOT hold — the route's
  // pending fallback flashes. The store-factory `batch` wrap (router.ts)
  // re-establishes the transition AT COMMIT TIME, so the re-render rides the
  // concurrent-navigation transition and the current page is held until the new
  // one resolves.
  beforeEach(() => {
    // A View Transitions API shim whose update callback runs on a later
    // macrotask (mirroring a real browser's deferred DOM-update phase).
    ;(document as any).startViewTransition = (cb: () => void) => {
      setTimeout(() => cb(), 0)
      return {
        finished: Promise.resolve(),
        ready: Promise.resolve(),
        updateCallbackDone: Promise.resolve(),
      }
    }
  })

  afterEach(() => {
    delete (document as any).startViewTransition
  })

  it('holds the current page while a same-route ?page change suspends, then swaps', async () => {
    resetDeferreds()
    // page=1 resolves up front so the initial view is committed content (not a
    // fallback) before we navigate.
    deferredFor(1).resolve('content-1')

    const router = makeSameRouteSearchRouter('/?page=1')
    // Drive the resolved commit through the (deferred) view transition.
    ;(router as any).options.defaultViewTransition = true
    await router.load()
    const r = mount(RouterProvider as any, { router })
    await flush()

    // page=1 committed.
    expect(r.findAll('.stories').length).toBe(1)
    expect(r.find('.stories').textContent).toBe('content-1')
    expect(r.findAll('.stories-pending').length).toBe(0)

    // Navigate to page=2 via a SAME-route search change. Do NOT resolve page=2.
    // Probe the DOM across the whole suspend window: the pending fallback must
    // NOT appear at any point (the current page is held).
    const navP = router.navigate({ to: '/', search: { page: 2 } })
    let flashedPending = false
    for (let i = 0; i < 20; i++) {
      await Promise.resolve()
      if (r.findAll('.stories-pending').length > 0) {
        flashedPending = true
      }
      if (i % 2 === 1) {
        await new Promise((res) => setTimeout(res, 0))
        await nextPaint()
      }
    }
    await navP

    // The router location advanced to ?page=2 …
    expect(router.state.location.search).toEqual({ page: 2 })

    // … and the route's pending fallback was never shown — page=1 stayed on
    // screen the entire time the new page was suspended (concurrent hold).
    expect(flashedPending).toBe(false)
    expect(r.findAll('.stories-pending').length).toBe(0)
    expect(r.findAll('.stories').length).toBe(1)
    expect(r.find('.stories').textContent).toBe('content-1')

    // Resolve page=2; the transition can now commit the new page.
    deferredFor(2).resolve('content-2')
    await flush()

    expect(r.findAll('.stories').length).toBe(1)
    expect(r.find('.stories').textContent).toBe('content-2')
    expect(r.find('.stories').getAttribute('data-page')).toBe('2')
    expect(r.findAll('.stories-pending').length).toBe(0)

    r.unmount()
  })
})
