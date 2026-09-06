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
import type * as Goober from 'goober'

const styleTemplates = vi.hoisted(() => [] as Array<unknown>)

vi.mock('goober', async (importOriginal) => {
  const actual = await importOriginal<typeof Goober>()
  return {
    ...actual,
    css(...args: Parameters<typeof actual.css>) {
      styleTemplates.push(args[0])
      return actual.css.apply(this, args)
    },
  }
})

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

describe('devtools performance', () => {
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

  it('pauses cache polling while closed and refreshes immediately on reopen', async () => {
    vi.useFakeTimers()
    const { router, routerState, cache } = createRouter()
    const values = vi.spyOn(cache, 'values')
    const container = document.createElement('div')
    document.body.append(container)
    devtools = new TanStackRouterDevtoolsCore({ router, routerState })
    devtools.mount(container)

    await vi.waitFor(() => {
      expect(
        container.querySelector('.TanStackRouterDevtoolsPanel'),
      ).not.toBeNull()
    })
    values.mockClear()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(values).not.toHaveBeenCalled()

    const open = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open TanStack Router Devtools"]',
    )!
    open.click()
    expect(values).toHaveBeenCalled()
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
    values.mockClear()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(values).not.toHaveBeenCalled()

    open.click()
    expect(container.textContent).toContain('updated while closed')
    values.mockClear()
    await vi.advanceTimersByTimeAsync(500)
    expect(values).toHaveBeenCalledTimes(1)

    devtools.unmount()
    devtools = undefined
    values.mockClear()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(values).not.toHaveBeenCalled()
  })

  it.each(['floating', 'standalone'] as const)(
    'generates shared styles once for a %s panel',
    async (kind) => {
      const Devtools =
        kind === 'floating'
          ? TanStackRouterDevtoolsCore
          : TanStackRouterDevtoolsPanelCore
      const { router, routerState } = createRouter(3)
      const container = document.createElement('div')
      document.body.append(container)
      styleTemplates.length = 0
      devtools = new Devtools({ router, routerState })
      devtools.mount(container)

      await vi.waitFor(() => {
        expect(
          container.querySelectorAll(
            '[aria-label^="Open match details for /route-"]',
          ).length,
        ).toBe(3)
      })
      // The first CSS template belongs to the shared panel style set.
      const firstTemplate = styleTemplates[0]
      expect(
        styleTemplates.filter((template) => template === firstTemplate).length,
      ).toBe(1)

      const firstPanelClass = container.querySelector(
        '.TanStackRouterDevtoolsPanel',
      )!.className
      devtools.unmount()
      extractCss()
      styleTemplates.length = 0
      devtools.mount(container)
      await vi.waitFor(() => {
        expect(
          container.querySelectorAll(
            '[aria-label^="Open match details for /route-"]',
          ).length,
        ).toBe(3)
      })
      expect(
        container.querySelector('.TanStackRouterDevtoolsPanel')!.className,
      ).toBe(firstPanelClass)
      expect(
        styleTemplates.filter((template) => template === firstTemplate).length,
      ).toBe(1)
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
