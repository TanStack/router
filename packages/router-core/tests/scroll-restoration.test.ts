import { createMemoryHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function createRouter(
  options: {
    scrollRestoration?: boolean
    scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
  } = {},
) {
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
  document.body.innerHTML = ''
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

  test('does not reset a restored element through scrollToTopSelectors', () => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    const router = createRouter({
      scrollRestoration: true,
      scrollToTopSelectors: ['#main-content'],
    })
    const element = document.createElement('div')

    element.id = 'main-content'
    element.scrollTo = vi.fn((options?: ScrollToOptions) => {
      element.scrollTop = options?.top ?? 0
      element.scrollLeft = options?.left ?? 0
    })
    document.body.append(element)

    element.scrollTop = 400
    element.dispatchEvent(new Event('scroll', { bubbles: true }))

    const location = router.latestLocation

    router.emit({
      type: 'onBeforeLoad',
      toLocation: location,
      fromLocation: location,
      pathChanged: false,
      hrefChanged: false,
      hashChanged: false,
    })

    element.scrollTop = 0

    router.emit({
      type: 'onRendered',
      toLocation: location,
      fromLocation: location,
      pathChanged: false,
      hrefChanged: false,
      hashChanged: false,
    })

    expect(element.scrollTop).toBe(400)
    expect(element.scrollTo).not.toHaveBeenCalled()
  })
})
