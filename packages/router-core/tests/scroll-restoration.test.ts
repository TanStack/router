import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function createRouter(options: { scrollRestoration?: boolean } = {}) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    ...options,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('setupScrollRestoration', () => {
  test('sets up scroll restoration when scrollRestoration is true', () => {
    const windowAddEventListener = vi.spyOn(window, 'addEventListener')
    const documentAddEventListener = vi.spyOn(document, 'addEventListener')
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'auto'

    const router = createRouter({ scrollRestoration: true })

    expect(router._scroll.restoring).toBe(true)
    expect(router._scroll.restoration).toBe(true)
    expect(window.history.scrollRestoration).toBe('manual')
    expect(
      windowAddEventListener.mock.calls.some(([event]) => event === 'pagehide'),
    ).toBe(true)
    expect(
      documentAddEventListener.mock.calls.some(
        ([event, _listener, options]) => event === 'scroll' && options === true,
      ),
    ).toBe(true)

    window.history.scrollRestoration = previousScrollRestoration
  })
})

describe('element scroll restoration', () => {
  const SELECTOR = '[data-scroll-restoration-id="container"]'

  function createScrollableElement() {
    const el = document.createElement('div')
    el.setAttribute('data-scroll-restoration-id', 'container')

    // jsdom has no layout, so back scrollTop/scrollLeft with real storage and
    // make `scrollTo` actually apply, so we can assert the user-visible result.
    let top = 0
    let left = 0
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => top,
      set: (v: number) => {
        top = v
      },
    })
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      get: () => left,
      set: (v: number) => {
        left = v
      },
    })
    const scrollTo = vi.fn((opts: { top?: number; left?: number }) => {
      if (opts.top !== undefined) top = opts.top
      if (opts.left !== undefined) left = opts.left
    })
    ;(el as any).scrollTo = scrollTo

    document.body.appendChild(el)
    return { el, scrollTo }
  }

  test('does not reset a restored element that is also in scrollToTopSelectors', async () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({ getParentRoute: () => rootRoute, path: '/' })
    const pageRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/page',
    })

    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, pageRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      scrollRestoration: true,
      // Key by pathname so revisiting `/page` restores its cached scroll.
      getScrollRestorationKey: (location) => location.pathname,
      scrollToTopSelectors: [SELECTOR],
    })

    await router.load()

    const { el, scrollTo } = createScrollableElement()

    const homeLocation = router.buildLocation({ to: '/' })
    const pageLocation = router.buildLocation({ to: '/page' })

    // Simulate the user scrolling the element on `/page`.
    el.scrollTop = 100
    el.dispatchEvent(new Event('scroll'))

    // Navigating away snapshots the element's scroll position under `/page`.
    router.emit({
      type: 'onBeforeLoad',
      fromLocation: pageLocation,
      toLocation: homeLocation,
      pathChanged: true,
      hrefChanged: true,
      hashChanged: false,
    })

    // Re-render `/page` with a scroll-resetting navigation (PUSH).
    router._scroll.next = true
    router.emit({
      type: 'onRendered',
      fromLocation: homeLocation,
      toLocation: pageLocation,
      pathChanged: true,
      hrefChanged: true,
      hashChanged: false,
    })

    // The element's restored scroll position must survive: the scroll-to-top
    // fallback should not reset an element that was just restored.
    expect(el.scrollTop).toBe(100)
    expect(scrollTo).not.toHaveBeenCalledWith(
      expect.objectContaining({ top: 0 }),
    )

    el.remove()
  })

  test.each([
    ['omitted', undefined],
    ['false', false],
  ] as const)(
    'does not setup scroll restoration when scrollRestoration is %s',
    (_name, scrollRestoration) => {
      const windowAddEventListener = vi.spyOn(window, 'addEventListener')
      const documentAddEventListener = vi.spyOn(document, 'addEventListener')
      const previousScrollRestoration = window.history.scrollRestoration

      window.history.scrollRestoration = 'auto'

      const router = createRouter(
        scrollRestoration === undefined ? {} : { scrollRestoration },
      )

      expect(router._scroll.restoring).toBeUndefined()
      expect(router._scroll.restoration).toBeUndefined()
      expect(router._scroll.reset).toBe(true)
      expect(window.history.scrollRestoration).toBe('auto')
      expect(
        windowAddEventListener.mock.calls.some(
          ([event]) => event === 'pagehide',
        ),
      ).toBe(false)
      expect(
        documentAddEventListener.mock.calls.some(
          ([event, _listener, options]) =>
            event === 'scroll' && options === true,
        ),
      ).toBe(false)

      window.history.scrollRestoration = previousScrollRestoration
    },
  )
})
