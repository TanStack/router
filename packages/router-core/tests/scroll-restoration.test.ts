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
  test.each(['auto', 'manual'] as const)(
    'restores browser scroll restoration to %s after the last owner is destroyed',
    (previous) => {
      window.history.scrollRestoration = previous
      const router = createRouter({ scrollRestoration: true })
      setupScrollRestoration(router)

      router.history.destroy()
      router.history.destroy()

      expect(window.history.scrollRestoration).toBe(previous)
    },
  )

  test.each([false, true])(
    'keeps manual restoration until both distinct histories are destroyed, reverse=%s',
    (reverse) => {
      window.history.scrollRestoration = 'auto'
      const first = createRouter({ scrollRestoration: true })
      const second = createRouter({ scrollRestoration: true })
      const histories = [first.history, second.history]
      if (reverse) {
        histories.reverse()
      }

      histories[0]!.destroy()
      expect(window.history.scrollRestoration).toBe('manual')
      histories[1]!.destroy()
      expect(window.history.scrollRestoration).toBe('auto')
    },
  )

  test('retains browser restoration ownership across shared history replacement', () => {
    window.history.scrollRestoration = 'auto'
    const history = createMemoryHistory()
    const replacement = createMemoryHistory()
    testHistories.add(replacement)
    const first = createRouter({ history, scrollRestoration: true })
    createRouter({ history, scrollRestoration: true })

    first.update({ history: replacement })
    history.destroy()
    expect(window.history.scrollRestoration).toBe('manual')
    replacement.destroy()
    expect(window.history.scrollRestoration).toBe('auto')
  })

  test('only counts restoration owners, including forced restoration', () => {
    window.history.scrollRestoration = 'auto'
    const router = createRouter({ scrollRestoration: false })
    const resetOnly = createRouter({ scrollRestoration: false })
    expect(window.history.scrollRestoration).toBe('auto')

    setupScrollRestoration(router, true)
    expect(window.history.scrollRestoration).toBe('manual')

    router.history.destroy()
    expect(window.history.scrollRestoration).toBe('auto')
    resetOnly.history.destroy()
    expect(window.history.scrollRestoration).toBe('auto')
  })

  test('preserves a browser restoration setting changed externally', () => {
    window.history.scrollRestoration = 'manual'
    const router = createRouter({ scrollRestoration: true })

    window.history.scrollRestoration = 'auto'
    router.history.destroy()

    expect(window.history.scrollRestoration).toBe('auto')
  })

  test('cleans up listeners and subscriptions when the history is destroyed', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
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

    expect(getKey).not.toHaveBeenCalled()
    expect(setItem).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
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

  test.each([false, true])(
    'reattaches after cleanup with scrollRestoration=%s',
    (scrollRestoration) => {
      const getKey = vi.fn((location: ParsedLocation) => location.href)
      const router = createRouter({
        scrollRestoration,
        getScrollRestorationKey: getKey,
      })

      router.history.destroy()
      setupScrollRestoration(router)
      setupScrollRestoration(router)

      window.dispatchEvent(new Event('pagehide'))
      expect(getKey).toHaveBeenCalledTimes(scrollRestoration ? 1 : 0)
      router.history.destroy()
      getKey.mockClear()
      window.dispatchEvent(new Event('pagehide'))
      expect(getKey).not.toHaveBeenCalled()
    },
  )

  test('cleans up after a throwing history destroy and can restore again', () => {
    window.history.scrollRestoration = 'auto'
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const nativeDestroy = history.destroy
    const originalDestroy = vi
      .fn(function (this: RouterHistory) {
        nativeDestroy.call(this)
      })
      .mockImplementationOnce(() => {
        throw new Error('destroy failed')
      })
    history.destroy = originalDestroy
    const router = createRouter({ history, scrollRestoration: true })
    createRouter({ history, scrollRestoration: true })

    expect(() => history.destroy()).toThrow('destroy failed')
    expect(window.history.scrollRestoration).toBe('auto')

    setupScrollRestoration(router)
    expect(window.history.scrollRestoration).toBe('manual')
    history.destroy()
    expect(window.history.scrollRestoration).toBe('auto')
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

  test('cleans mixed shared owners after one moves to another history', () => {
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const replacement = createMemoryHistory({ initialEntries: ['/'] })
    testHistories.add(replacement)
    const resetOnly = createRouter({ history, scrollRestoration: false })
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const getKey = vi.fn((location: ParsedLocation) => location.href)
    const restoring = createRouter({
      history,
      scrollRestoration: true,
      getScrollRestorationKey: getKey,
    })

    restoring.update({ history: replacement })
    history.destroy()

    emitNavigation(
      resetOnly,
      'onRendered',
      getLocation(resetOnly, '/before'),
      getLocation(resetOnly, '/after'),
    )
    expect(scrollTo).not.toHaveBeenCalled()
    window.dispatchEvent(new Event('pagehide'))
    expect(getKey).toHaveBeenCalledOnce()

    replacement.destroy()
    getKey.mockClear()
    window.dispatchEvent(new Event('pagehide'))
    expect(getKey).not.toHaveBeenCalled()
  })

  test.each([false, true])(
    'preserves external destroy wrappers over repeated generations with throwing=%s',
    (throwFirst) => {
      const history = createMemoryHistory({ initialEntries: ['/'] })
      const nativeDestroy = history.destroy
      const originalDestroy = vi.fn(function (this: RouterHistory) {
        nativeDestroy.call(this)
      })
      if (throwFirst) {
        originalDestroy.mockImplementationOnce(function (this: RouterHistory) {
          nativeDestroy.call(this)
          throw new Error('destroy failed')
        })
      }
      history.destroy = originalDestroy
      const router = createRouter({ history, scrollRestoration: true })
      const firstWrapper = history.destroy
      const externalDestroy = vi.fn(function (this: RouterHistory) {
        firstWrapper.call(this)
      })
      history.destroy = externalDestroy

      for (let generation = 0; generation < 3; generation++) {
        if (throwFirst && generation === 0) {
          expect(() => history.destroy()).toThrow('destroy failed')
        } else {
          history.destroy()
        }
        expect(history.destroy).toBe(externalDestroy)
        expect(originalDestroy).toHaveBeenCalledTimes(generation + 1)
        expect(externalDestroy).toHaveBeenCalledTimes(generation + 1)
        expect(originalDestroy.mock.instances[generation]).toBe(history)
        if (generation < 2) {
          setupScrollRestoration(router)
        }
      }
    },
  )

  test('restores captured positions after restoration is enabled repeatedly', () => {
    const element = document.createElement('div')
    element.dataset.scrollRestorationId = 'enabled-later'
    document.body.append(element)
    const router = createRouter({
      scrollRestoration: false,
      getScrollRestorationKey: (location) => location.pathname,
    })
    setupScrollRestoration(router, true)
    setupScrollRestoration(router, true)
    const source = getLocation(router, '/enable-source')
    const destination = getLocation(router, '/enable-destination')
    element.scrollTop = 120
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
    emitNavigation(router, 'onBeforeLoad', source, destination)
    element.scrollTop = 0
    vi.stubGlobal('scrollTo', vi.fn())
    emitNavigation(router, 'onRendered', destination, source)
    expect(element.scrollTop).toBe(120)
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
  })

  test('sets up scroll restoration when scrollRestoration is true', () => {
    const windowAddEventListener = vi.spyOn(window, 'addEventListener')
    const documentAddEventListener = vi.spyOn(document, 'addEventListener')
    const previousScrollRestoration = window.history.scrollRestoration

    window.history.scrollRestoration = 'auto'

    const router = createRouter({ scrollRestoration: true })

    expect(router._scroll.restoring).toBe(true)
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
