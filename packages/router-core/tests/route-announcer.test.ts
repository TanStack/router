import { createMemoryHistory } from '@tanstack/history'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BaseRootRoute, BaseRoute, setupRouteAnnouncer } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { ParsedLocation, RouteAnnouncerOptions } from '../src'

function createRouter() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
}

function getLocation(
  router: ReturnType<typeof createRouter>,
  pathname: string,
): ParsedLocation {
  return { ...router.latestLocation, href: pathname, pathname }
}

function setup(options?: RouteAnnouncerOptions) {
  const router = createRouter()
  const region = document.createElement('div')
  document.body.append(region)
  const unsubscribe = setupRouteAnnouncer(router, region, options)

  // `from: null` is the first render of a client-only app.
  const renderPath = (pathname: string, from: string | null = '/') => {
    const fromLocation = from === null ? undefined : getLocation(router, from)
    const toLocation = getLocation(router, pathname)
    router.emit({
      type: 'onRendered',
      fromLocation,
      toLocation,
      pathChanged: fromLocation?.pathname !== pathname,
      hrefChanged: fromLocation?.href !== pathname,
      hashChanged: false,
    })
  }

  return { region, unsubscribe, renderPath }
}

beforeEach(() => {
  // The router's own scroll restoration also listens to `onRendered`.
  vi.stubGlobal('scrollTo', vi.fn())
})

afterEach(() => {
  document.body.replaceChildren()
  document.title = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('setupRouteAnnouncer', () => {
  test('focuses the h1 without scrolling and announces the title', () => {
    document.body.innerHTML = '<main><h1>About</h1></main>'
    document.title = 'About | App'
    const heading = document.querySelector('h1')!
    const focus = vi.spyOn(heading, 'focus')
    const { region, renderPath } = setup()

    renderPath('/about')

    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute('tabindex')).toBe('-1')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(region.textContent).toBe('About | App')
  })

  test('falls back to main when the page has no h1', () => {
    document.body.innerHTML = '<main><p>No heading</p></main>'
    const { renderPath } = setup()

    renderPath('/about')

    expect(document.activeElement).toBe(document.querySelector('main'))
  })

  test('tries focusSelectors in order', () => {
    document.body.innerHTML =
      '<header><h1>App</h1></header><main><h2 id="page-title">About</h2></main>'
    const { renderPath } = setup({ focusSelectors: ['main h1', '#page-title'] })

    renderPath('/about')

    expect(document.activeElement).toBe(document.getElementById('page-title'))
  })

  test('leaves focus alone when focusSelectors is empty', () => {
    document.body.innerHTML = '<main><h1>About</h1></main>'
    document.title = 'About'
    const { region, renderPath } = setup({ focusSelectors: [] })

    renderPath('/about')

    expect(document.activeElement).toBe(document.body)
    expect(document.querySelector('h1')!.hasAttribute('tabindex')).toBe(false)
    expect(region.textContent).toBe('About')
  })

  test('keeps an existing tabindex', () => {
    document.body.innerHTML = '<main><h1 tabindex="0">About</h1></main>'
    const { renderPath } = setup()

    renderPath('/about')

    expect(document.querySelector('h1')!.getAttribute('tabindex')).toBe('0')
  })

  test('does not add a tabindex to a natively focusable target', () => {
    document.body.innerHTML = '<main><button id="start">Start</button></main>'
    const { renderPath } = setup({ focusSelectors: ['#start'] })

    renderPath('/about')

    const button = document.getElementById('start')!
    expect(document.activeElement).toBe(button)
    expect(button.hasAttribute('tabindex')).toBe(false)
  })

  test('announces the h1 and then the pathname when there is no title', () => {
    document.body.innerHTML = '<main><h1>About</h1></main>'
    const { region, renderPath } = setup()

    renderPath('/about')
    expect(region.textContent).toBe('About')

    document.body.replaceChildren(region)
    renderPath('/contact')
    expect(region.textContent).toBe('/contact')
  })

  test('replaces the text node when the title repeats', () => {
    document.title = 'Same'
    const { region, renderPath } = setup()

    renderPath('/a')
    const first = region.firstChild
    renderPath('/b')

    expect(region.textContent).toBe('Same')
    expect(region.firstChild).not.toBe(first)
  })

  test('ignores the first render and same-path renders', () => {
    document.body.innerHTML = '<main><h1>Home</h1></main>'
    document.title = 'Home'
    const { region, renderPath } = setup()

    renderPath('/', null)
    renderPath('/about', null)
    renderPath('/', '/')

    expect(document.activeElement).toBe(document.body)
    expect(region.textContent).toBe('')
  })

  test('stops after unsubscribe', () => {
    document.title = 'About'
    const { region, unsubscribe, renderPath } = setup()

    unsubscribe()
    renderPath('/about')

    expect(region.textContent).toBe('')
  })
})
