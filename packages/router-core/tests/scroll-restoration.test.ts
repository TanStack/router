import { createMemoryHistory } from '@tanstack/history'
import type { RouterHistory } from '@tanstack/history'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, setupScrollRestoration } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { ParsedLocation } from '../src'

const testHistories = new Set<RouterHistory>()

function createRouter(
  options: {
    history?: ReturnType<typeof createMemoryHistory>
    scrollRestoration?: boolean
    scrollToTopSelectors?: Array<string | (() => Element | null | undefined)>
    getScrollRestorationKey?: (location: ParsedLocation) => string
  } = {},
) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const history =
    options.history ?? createMemoryHistory({ initialEntries: ['/'] })
  testHistories.add(history)
  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history,
    ...options,
  })
}

afterEach(() => {
  for (const history of testHistories) {
    history.destroy()
  }
  testHistories.clear()
  document.body.replaceChildren()
  window.sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function getLocation(
  router: ReturnType<typeof createRouter>,
  pathname: string,
) {
  return {
    ...router.latestLocation,
    href: pathname,
    pathname,
  }
}

function emitNavigation(
  router: ReturnType<typeof createRouter>,
  type: 'onBeforeLoad' | 'onRendered',
  fromLocation: ParsedLocation,
  toLocation: ParsedLocation,
) {
  router.emit({
    type,
    fromLocation,
    toLocation,
    pathChanged: true,
    hrefChanged: true,
    hashChanged: false,
  })
}

describe('setupScrollRestoration', () => {
  test('cleans up listeners and subscriptions when the history is destroyed', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const originalDestroy = history.destroy
    const documentRemoveEventListener = vi.spyOn(
      document,
      'removeEventListener',
    )
    const windowRemoveEventListener = vi.spyOn(window, 'removeEventListener')
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const getKey = vi.fn((location: ParsedLocation) => location.href)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')

    const router = createRouter({
      history,
      scrollRestoration: true,
      getScrollRestorationKey: getKey,
    })
    history.destroy()
    document.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('pagehide'))
    emitNavigation(
      router,
      'onBeforeLoad',
      router.latestLocation,
      getLocation(router, '/destroyed'),
    )
    emitNavigation(
      router,
      'onRendered',
      router.latestLocation,
      getLocation(router, '/destroyed'),
    )

    expect(history.destroy).toBe(originalDestroy)
    expect(getKey).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
    expect(
      [...router.subscribers].filter(
        (subscriber) =>
          subscriber.eventType === 'onBeforeLoad' ||
          subscriber.eventType === 'onRendered',
      ),
    ).toHaveLength(0)
    expect(getKey).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(documentRemoveEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function),
      true,
    )
    expect(windowRemoveEventListener).toHaveBeenCalledWith(
      'pagehide',
      expect.any(Function),
    )
  })

  test('shares one history destroy wrapper across routers', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const originalDestroy = history.destroy

    createRouter({ history, scrollRestoration: true })
    const wrapper = history.destroy
    createRouter({ history, scrollRestoration: true })

    expect(history.destroy).toBe(wrapper)
    history.destroy()
    expect(history.destroy).toBe(originalDestroy)
  })

  test('cleans only the routers still attached to each shared history', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const otherHistory = createMemoryHistory({ initialEntries: ['/'] })
    testHistories.add(otherHistory)
    const getKeyA = vi.fn((location: ParsedLocation) => `a:${location.href}`)
    const getKeyB = vi.fn((location: ParsedLocation) => `b:${location.href}`)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    const routerA = createRouter({
      history,
      scrollRestoration: true,
      getScrollRestorationKey: getKeyA,
    })
    createRouter({
      history,
      scrollRestoration: true,
      getScrollRestorationKey: getKeyB,
    })

    routerA.update({ history: otherHistory })
    getKeyA.mockClear()
    getKeyB.mockClear()
    setItem.mockClear()
    history.destroy()
    window.dispatchEvent(new Event('pagehide'))

    expect(getKeyA).toHaveBeenCalledOnce()
    expect(getKeyB).not.toHaveBeenCalled()
    expect(setItem).toHaveBeenCalledOnce()
    otherHistory.destroy()
  })

  test('composes external destroy wrappers across detach and reattach', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const nativeDestroy = history.destroy
    const originalDestroy = vi.fn(function (this: RouterHistory) {
      nativeDestroy.call(this)
    })
    history.destroy = originalDestroy
    const router = createRouter({ history, scrollRestoration: true })
    const retainedWrapper = history.destroy
    const replacement = createMemoryHistory({ initialEntries: ['/'] })
    testHistories.add(replacement)

    const externalDestroy = vi.fn(function (this: RouterHistory) {
      retainedWrapper.call(this)
    })
    history.destroy = externalDestroy
    router.update({ history: replacement })
    originalDestroy.mockClear()
    history.destroy()

    expect(externalDestroy).toHaveBeenCalledOnce()
    expect(originalDestroy).toHaveBeenCalledOnce()
    expect(originalDestroy.mock.instances[0]).toBe(history)

    createRouter({ history, scrollRestoration: true })
    originalDestroy.mockClear()
    history.destroy()
    expect(originalDestroy).toHaveBeenCalledOnce()
    expect(originalDestroy.mock.instances[0]).toBe(history)
  })

  test('cleans the old attachment when replacing history', () => {
    const oldHistory = createMemoryHistory({ initialEntries: ['/'] })
    const newHistory = createMemoryHistory({ initialEntries: ['/'] })
    testHistories.add(newHistory)
    const oldDestroy = oldHistory.destroy
    const newDestroy = newHistory.destroy
    const router = createRouter({
      history: oldHistory,
      scrollRestoration: true,
    })

    router.update({ history: newHistory })
    oldHistory.destroy()

    expect(oldHistory.destroy).toBe(oldDestroy)
    expect(newHistory.destroy).not.toBe(newDestroy)
    newHistory.destroy()
  })

  test('keeps one rendered subscription and tracked target set when enabling later', () => {
    const router = createRouter({ scrollRestoration: false })
    const trackedScrollTargets = router._scroll.trackedScrollTargets

    setupScrollRestoration(router, true)
    setupScrollRestoration(router, true)

    expect(router._scroll.trackedScrollTargets).toBe(trackedScrollTargets)
    expect(
      [...router.subscribers].filter(
        (subscriber) => subscriber.eventType === 'onRendered',
      ),
    ).toHaveLength(1)
    router.history.destroy()
  })

  test('preserves forced restoration through history replacement', () => {
    const firstHistory = createMemoryHistory({ initialEntries: ['/'] })
    const secondHistory = createMemoryHistory({ initialEntries: ['/'] })
    testHistories.add(secondHistory)
    const element = document.createElement('div')
    element.id = 'unit-forced-replacement-element'
    element.dataset.scrollRestorationId = element.id
    document.body.append(element)
    const router = createRouter({
      history: firstHistory,
      scrollRestoration: false,
      getScrollRestorationKey: (location) => location.pathname,
    })

    setupScrollRestoration(router, true)
    router.update({ history: secondHistory })
    const source = getLocation(router, '/forced-source')
    const destination = getLocation(router, '/forced-destination')
    element.scrollTop = 120
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    emitNavigation(router, 'onBeforeLoad', source, destination)
    element.scrollTop = 0
    vi.stubGlobal('scrollTo', vi.fn())
    emitNavigation(router, 'onRendered', destination, source)

    expect(router._scroll.restoring).toBe(true)
    expect(element.scrollTop).toBe(120)
  })

  test('removes reset-only rendered work when its history is destroyed', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const router = createRouter({ history, scrollRestoration: false })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    history.destroy()
    emitNavigation(
      router,
      'onRendered',
      getLocation(router, '/from'),
      getLocation(router, '/to'),
    )

    expect(scrollTo).not.toHaveBeenCalled()
    expect(
      [...router.subscribers].filter(
        (subscriber) => subscriber.eventType === 'onRendered',
      ),
    ).toHaveLength(0)
  })

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

  test('snapshots the live position when it changed after the latest scroll event', () => {
    const element = document.createElement('div')
    element.id = 'unit-live-snapshot-element'
    document.body.append(element)
    vi.stubGlobal('scrollTo', vi.fn())

    const router = createRouter({
      scrollRestoration: true,
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-live-snapshot-source')
    const destination = getLocation(router, '/unit-live-snapshot-destination')

    element.scrollTop = 80
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    element.scrollTop = 120

    emitNavigation(router, 'onBeforeLoad', source, destination)
    element.scrollTop = 0
    emitNavigation(router, 'onRendered', source, destination)

    expect(element.scrollTop).toBe(120)
  })

  test('snapshots the live window position when it changed after the latest scroll event', () => {
    const windowScrollTo = vi.fn()
    vi.stubGlobal('scrollTo', windowScrollTo)
    vi.stubGlobal('scrollX', 0)
    vi.stubGlobal('scrollY', 80)

    const router = createRouter({
      scrollRestoration: true,
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-live-window-snapshot-source')
    const destination = getLocation(
      router,
      '/unit-live-window-snapshot-destination',
    )

    document.dispatchEvent(new Event('scroll'))
    vi.stubGlobal('scrollY', 120)

    emitNavigation(router, 'onBeforeLoad', source, destination)
    emitNavigation(router, 'onRendered', source, destination)
    windowScrollTo.mockClear()

    emitNavigation(router, 'onBeforeLoad', destination, source)
    emitNavigation(router, 'onRendered', destination, source)

    expect(windowScrollTo).toHaveBeenCalledWith({
      top: 120,
      left: 0,
      behavior: undefined,
    })
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

  test('restores a configured element independently from the window', () => {
    const element = document.createElement('div')
    element.id = 'unit-restored-element'
    element.dataset.scrollRestorationId = 'unit-restored-element'
    document.body.append(element)

    const elementScrollTo = vi.fn((options: ScrollToOptions) => {
      element.scrollTop = options.top ?? element.scrollTop
    })
    element.scrollTo = elementScrollTo as typeof element.scrollTo
    const windowScrollTo = vi.fn()
    vi.stubGlobal('scrollTo', windowScrollTo)

    const router = createRouter({
      scrollRestoration: true,
      scrollToTopSelectors: ['#unit-restored-element'],
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-element-source')
    const destination = getLocation(router, '/unit-element-destination')

    element.scrollTop = 80
    element.dispatchEvent(new Event('scroll', { bubbles: true }))

    emitNavigation(router, 'onBeforeLoad', source, destination)
    emitNavigation(router, 'onRendered', source, destination)
    expect(element.scrollTop).toBe(0)

    elementScrollTo.mockClear()
    windowScrollTo.mockClear()
    vi.stubGlobal('scrollX', 0)
    vi.stubGlobal('scrollY', 120)
    document.dispatchEvent(new Event('scroll'))
    emitNavigation(router, 'onBeforeLoad', destination, source)
    emitNavigation(router, 'onRendered', destination, source)

    expect(element.scrollTop).toBe(80)
    expect(elementScrollTo).not.toHaveBeenCalled()
    expect(windowScrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: undefined,
    })
  })

  test('resets an uncached configured element when the window restores', () => {
    const element = document.createElement('div')
    element.id = 'unit-reset-element'
    document.body.append(element)

    const elementScrollTo = vi.fn((options: ScrollToOptions) => {
      element.scrollTop = options.top ?? element.scrollTop
    })
    element.scrollTo = elementScrollTo as typeof element.scrollTo

    const windowScrollTo = vi.fn()
    vi.stubGlobal('scrollX', 0)
    vi.stubGlobal('scrollY', 120)
    vi.stubGlobal('scrollTo', windowScrollTo)

    const router = createRouter({
      scrollRestoration: true,
      scrollToTopSelectors: ['#unit-reset-element'],
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-window-source')
    const destination = getLocation(router, '/unit-window-destination')

    document.dispatchEvent(new Event('scroll'))
    emitNavigation(router, 'onBeforeLoad', source, destination)
    emitNavigation(router, 'onRendered', source, destination)

    elementScrollTo.mockClear()
    windowScrollTo.mockClear()
    element.scrollTop = 80

    emitNavigation(router, 'onBeforeLoad', destination, source)
    emitNavigation(router, 'onRendered', destination, source)

    expect(windowScrollTo).toHaveBeenCalledWith({
      top: 120,
      left: 0,
      behavior: undefined,
    })
    expect(element.scrollTop).toBe(0)
    expect(elementScrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: undefined,
    })
  })

  test('resets a configured element when its cached selector becomes stale', () => {
    const element = document.createElement('div')
    element.id = 'unit-stale-selector-element'
    element.dataset.scrollRestorationId = 'unit-stale-selector-source'
    document.body.append(element)

    const elementScrollTo = vi.fn((options: ScrollToOptions) => {
      element.scrollTop = options.top ?? element.scrollTop
    })
    element.scrollTo = elementScrollTo as typeof element.scrollTo
    vi.stubGlobal('scrollTo', vi.fn())

    const router = createRouter({
      scrollRestoration: true,
      scrollToTopSelectors: [() => element],
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-stale-selector-source')
    const destination = getLocation(router, '/unit-stale-selector-destination')

    element.scrollTop = 80
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    emitNavigation(router, 'onBeforeLoad', source, destination)
    emitNavigation(router, 'onRendered', source, destination)
    expect(element.scrollTop).toBe(0)

    element.dataset.scrollRestorationId = 'unit-stale-selector-current'
    element.scrollTop = 40
    elementScrollTo.mockClear()
    emitNavigation(router, 'onBeforeLoad', destination, source)
    emitNavigation(router, 'onRendered', destination, source)

    expect(element.scrollTop).toBe(0)
    expect(elementScrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: undefined,
    })
  })

  test('does not resolve configured selectors for hash navigation without source entries', () => {
    const element = document.createElement('div')
    document.body.append(element)
    const getElement = vi.fn(() => element)

    const router = createRouter({
      scrollRestoration: true,
      scrollToTopSelectors: [getElement],
      getScrollRestorationKey: (location) => location.pathname,
    })
    const source = getLocation(router, '/unit-hash-source')
    const destination = {
      ...getLocation(router, '/unit-hash-destination'),
      hash: 'section',
    }

    emitNavigation(router, 'onRendered', source, destination)

    expect(getElement).not.toHaveBeenCalled()
  })
})
