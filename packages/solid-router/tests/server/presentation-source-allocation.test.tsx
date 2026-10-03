import { JSDOM } from 'jsdom'
import { renderToString } from 'solid-js/web'
import { expect, test, vi } from 'vitest'
import {
  MatchRoute,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
  useMatch,
  useMatchRoute,
  useMatches,
} from '../../src'
import type * as Solid from 'solid-js'

const audit = vi.hoisted(() => ({
  current: undefined as string | undefined,
  allocations: [] as Array<string>,
}))

vi.mock('solid-js', async () => {
  const actual = await vi.importActual<typeof Solid>('solid-js')
  const observe =
    (name: string, fn: (...args: Array<any>) => any) =>
    (...args: Array<any>) => {
      if (audit.current) {
        audit.allocations.push(`${audit.current}:${name}`)
      }
      return fn(...args)
    }
  return {
    ...actual,
    createMemo: observe('memo', actual.createMemo),
    createSignal: observe('signal', actual.createSignal),
    createEffect: observe('effect', actual.createEffect),
  }
})

function observed<T>(name: string, callback: () => T): T {
  audit.current = name
  try {
    return callback()
  } finally {
    audit.current = undefined
  }
}

test('server context consumers return visible snapshots without creating native reactivity', async () => {
  audit.allocations.length = 0
  let matchSelections = 0
  let matchesSelections = 0
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page ?? 0) }),
    component: () => {
      const link = observed('Link', () =>
        useLinkProps({ to: '/target', search: true }),
      )
      const nearest = observed('useMatch', () =>
        useMatch({
          strict: false,
          select: (match) => {
            matchSelections++
            return match.routeId
          },
        }),
      )
      const matches = observed('useMatches', () =>
        useMatches({
          select: (all) => {
            matchesSelections++
            return all.length
          },
        }),
      )
      const matchRoute = useMatchRoute()
      const route = observed('useMatchRoute', () =>
        matchRoute({ to: '/items/$id', params: { id: 'one' } }),
      )
      const matchedChild = observed('MatchRoute', () =>
        MatchRoute({
          to: '/items/$id',
          params: { id: 'one' },
          children: (params: unknown) => (
            <span data-testid="matched-child">
              {params ? 'matched' : 'missing'}
            </span>
          ),
        }),
      )
      // Accessors expose the selected server snapshot on every read.
      nearest()
      matches()
      route()
      return (
        <>
          <a {...link}>Target</a>
          <span data-testid="nearest">{nearest()}</span>
          <span data-testid="matches">{matches()}</span>
          <span data-testid="route">{route() ? 'matched' : 'missing'}</span>
          {matchedChild}
          <Outlet />
        </>
      )
    },
  })
  const item = createRoute({
    getParentRoute: () => root,
    path: '/items/$id',
    component: () => <h1>Item</h1>,
  })
  const target = createRoute({ getParentRoute: () => root, path: '/target' })
  const router = createRouter({
    routeTree: root.addChildren([item, target]),
    history: createMemoryHistory({ initialEntries: ['/items/one?page=2'] }),
    isServer: true,
  })
  await router.load()
  const html = renderToString(() => <RouterProvider router={router} />)
  const document = new JSDOM(html).window.document
  expect(document.querySelector('a')?.getAttribute('href')).toBe(
    '/target?page=2',
  )
  expect(document.querySelector('[data-testid="nearest"]')?.textContent).toBe(
    '__root__',
  )
  expect(document.querySelector('[data-testid="matches"]')?.textContent).toBe(
    '2',
  )
  expect(document.querySelector('[data-testid="route"]')?.textContent).toBe(
    'matched',
  )
  expect(
    document.querySelector('[data-testid="matched-child"]')?.textContent,
  ).toBe('matched')
  expect(document.querySelector('h1')?.textContent).toBe('Item')
  expect(matchSelections).toBe(1)
  expect(matchesSelections).toBe(1)
  expect(audit.allocations).toEqual([])
})
