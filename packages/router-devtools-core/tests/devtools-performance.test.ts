import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'
import { extractCss } from 'goober'
import { TanStackRouterDevtoolsCore } from '../src/TanStackRouterDevtoolsCore'
import { TanStackRouterDevtoolsPanelCore } from '../src/TanStackRouterDevtoolsPanelCore'
import type { AnyRouteMatch, AnyRouter } from '@tanstack/router-core'

function createCachedMatch(loaderData: string): AnyRouteMatch {
  return {
    id: 'cached-match',
    routeId: '/route-0',
    pathname: '/route-0',
    params: {},
    search: {},
    status: 'success',
    isFetching: false,
    updatedAt: Date.now(),
    loaderData,
  } as AnyRouteMatch
}

function createRouter(childRoutes = 1) {
  const routes = Array.from({ length: childRoutes }, (_, i) => ({
    id: `/route-${i}`,
    path: `route-${i}`,
    fullPath: `/route-${i}`,
    rank: i,
    children: [],
    options: { loader: () => undefined },
  }))
  const routeTree = {
    id: '__root__',
    path: '/',
    fullPath: '/',
    rank: 0,
    children: routes,
    options: {},
  }
  const cache = new Map([['cached-match', createCachedMatch('old data')]])
  const router = {
    _cache: cache,
    routeTree,
    routesById: Object.fromEntries(
      [routeTree, ...routes].map((route) => [route.id, route]),
    ),
    options: {},
    navigate: vi.fn(),
  } as unknown as AnyRouter
  const routerState = {
    location: {
      href: '/',
      pathname: '/',
      search: {},
      searchStr: '',
      hash: '',
    },
    matches: [],
  }
  return { router, routerState, cache }
}

describe('devtools panel behavior', () => {
  let devtools:
    | TanStackRouterDevtoolsCore
    | TanStackRouterDevtoolsPanelCore
    | undefined

  beforeAll(async () => {
    await import('../src/FloatingTanStackRouterDevtools')
  }, 30_000)

  afterEach(() => {
    devtools?.unmount()
    devtools = undefined
    document.body.innerHTML = ''
    window.localStorage.clear()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('displays current cache data while open and after reopening', async () => {
    vi.useFakeTimers()
    const { router, routerState, cache } = createRouter()
    const container = document.createElement('div')
    document.body.append(container)
    devtools = new TanStackRouterDevtoolsCore({ router, routerState })
    devtools.mount(container)

    await vi.waitFor(() => {
      expect(
        container.querySelector('.TanStackRouterDevtoolsPanel'),
      ).not.toBeNull()
    })
    await vi.advanceTimersByTimeAsync(2_000)

    const open = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open TanStack Router Devtools"]',
    )!
    open.click()
    const match = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open match details for cached-match"]',
    )!
    match.click()
    expect(container.textContent).toContain('old data')

    cache.set('cached-match', createCachedMatch('updated while open'))
    await vi.advanceTimersByTimeAsync(500)
    expect(container.textContent).toContain('updated while open')

    container
      .querySelector<HTMLButtonElement>(
        '.TanStackRouterDevtoolsPanel > button',
      )!
      .click()
    cache.set('cached-match', createCachedMatch('updated while closed'))
    await vi.advanceTimersByTimeAsync(2_000)

    open.click()
    expect(container.textContent).toContain('updated while closed')
    await vi.advanceTimersByTimeAsync(500)

    devtools.unmount()
    devtools = undefined
    await vi.advanceTimersByTimeAsync(2_000)
    expect(container.textContent).toBe('')
  })

  it.each(['floating', 'standalone'] as const)(
    'restores styles when a %s panel is remounted',
    async (kind) => {
      const Devtools =
        kind === 'floating'
          ? TanStackRouterDevtoolsCore
          : TanStackRouterDevtoolsPanelCore
      const { router, routerState } = createRouter(3)
      const container = document.createElement('div')
      document.body.append(container)
      devtools = new Devtools({ router, routerState })
      devtools.mount(container)

      await vi.waitFor(() => {
        expect(
          container.querySelectorAll(
            '[aria-label^="Open match details for /route-"]',
          ).length,
        ).toBe(3)
      })
      devtools.unmount()
      extractCss()
      devtools.mount(container)
      await vi.waitFor(() => {
        expect(
          container.querySelectorAll(
            '[aria-label^="Open match details for /route-"]',
          ).length,
        ).toBe(3)
      })
      expect(document.getElementById('_goober')?.textContent).toContain(
        'position:fixed',
      )
    },
  )

  it('installs shared and dynamic styles in each shadow root', async () => {
    const { router, routerState } = createRouter(3)
    const roots = Array.from({ length: 2 }, () => {
      const host = document.createElement('div')
      document.body.append(host)
      return host.attachShadow({ mode: 'open' })
    })

    for (const root of roots) {
      const container = document.createElement('div')
      root.append(container)
      const instance = new TanStackRouterDevtoolsCore({
        router,
        routerState,
        shadowDOMTarget: root,
      })
      instance.mount(container)
      onTestFinished(() => instance.unmount())
      await vi.waitFor(() => {
        expect(root.querySelector('style')?.textContent).toContain(
          'position:fixed',
        )
      })

      const open = root.querySelector<HTMLButtonElement>(
        '[aria-label="Open TanStack Router Devtools"]',
      )!
      open.click()
      expect(root.querySelector('style')?.textContent).toContain(
        'visibility:visible',
      )
      root
        .querySelector<HTMLButtonElement>(
          '.TanStackRouterDevtoolsPanel > button',
        )!
        .click()
      expect(root.querySelector('style')?.textContent).toContain(
        'visibility:hidden',
      )
    }

    expect(roots[0]!.querySelector('style')?.textContent).toBe(
      roots[1]!.querySelector('style')?.textContent,
    )
  })
})
