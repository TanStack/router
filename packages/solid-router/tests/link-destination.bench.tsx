import { cleanup, render } from '@solidjs/testing-library'
import { createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { bench, describe, expect } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const linkIds = Array.from({ length: 200 }, (_, index) => String(index))
const search = { filters: Array.from({ length: 16 }, (_, page) => ({ page })) }

describe.each([
  'simple',
  'fixed',
  'inherited',
  'mixed',
  'reactive',
  'store',
] as const)('persistent Solid Link destinations: %s', (mode) => {
  let router: ReturnType<typeof createRouter>
  let container: HTMLElement
  let setId: (id: string) => void
  let id: () => string
  let params: { id: string }
  let setParams: (key: 'id', value: string) => void
  let storeSearch: typeof search
  let setPage: (page: number) => void
  let current = 'one'

  const before = async (warm = true) => {
    const root = createRootRoute()
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source/$id',
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
    })
    router = createRouter({
      routeTree: root.addChildren([source, target]),
      history: createMemoryHistory({
        initialEntries: ['/source/one?shared=one'],
      }),
    })
    ;[id, setId] = createSignal('one')
    ;[params, setParams] = createStore({ id: 'one' })
    const [filters, setFilters] = createStore({
      filters: search.filters.map(({ page }, index) => ({
        page: index ? page : 1,
      })),
    })
    storeSearch = { filters: filters.filters }
    setPage = (page) => setFilters('filters', 0, 'page', page)
    current = 'one'
    await router.load()
    ;({ container } = render(() => (
      <RouterContextProvider router={router}>
        {() =>
          linkIds.map((linkId, index) => {
            const inherited =
              mode === 'inherited' || (mode === 'mixed' && index % 2 === 1)
            return (
              <Link
                to="/target/$id"
                params={
                  mode === 'store'
                    ? params
                    : inherited
                      ? true
                      : { id: mode === 'reactive' ? id() : linkId }
                }
                search={
                  mode === 'store'
                    ? storeSearch
                    : mode === 'simple'
                      ? undefined
                      : inherited
                        ? true
                        : search
                }
              />
            )
          })
        }
      </RouterContextProvider>
    )))
    expect(container.querySelectorAll('a')).toHaveLength(linkIds.length)
    if (warm) {
      await tick()
      await tick()
    }
    assertDestination()
  }

  const tick = async () => {
    current = current === 'one' ? 'two' : 'one'
    if (mode === 'reactive') {
      setId(current)
    }
    if (mode === 'store') {
      setParams('id', current)
      setPage(current === 'one' ? 1 : 2)
    }
    await router.navigate({
      to: '/source/$id',
      params: { id: current },
      search: { shared: current },
      replace: true,
    } as any)
  }

  const assertDestination = () => {
    const first = container.querySelector('a')!
    expect(first.getAttribute('href')).toContain(
      `/target/${mode === 'inherited' || mode === 'store' ? current : mode === 'reactive' ? id() : '0'}${mode === 'simple' ? '' : '?'}`,
    )
    if (mode === 'mixed') {
      expect(container.querySelectorAll('a')[1]!.getAttribute('href')).toBe(
        `/target/${current}?shared=${current}`,
      )
    }
    if (mode === 'store') {
      const href = new URL(first.getAttribute('href')!, 'https://example.com')
      expect(JSON.parse(href.searchParams.get('filters')!)[0].page).toBe(
        current === 'one' ? 1 : 2,
      )
    }
  }

  bench(
    'eight navigations with 200 persistent links',
    async () => {
      for (let step = 0; step < 8; step++) {
        await tick()
      }
    },
    {
      time: 2000,
      warmupTime: 500,
      warmupIterations: 30,
      throws: true,
      setup: () => before(),
      teardown: () => {
        assertDestination()
        cleanup()
        router.history.destroy()
      },
    },
  )

  if (mode === 'store') {
    bench(
      'cold store mount and first mutation/navigation with 200 links',
      async () => {
        await before(false)
        await tick()
        assertDestination()
        cleanup()
        router.history.destroy()
      },
      { time: 2000, warmupTime: 500, warmupIterations: 30, throws: true },
    )
  }
  if (mode === 'fixed') {
    bench(
      'cold mount with 200 nested-search links',
      async () => {
        await before(false)
        cleanup()
        router.history.destroy()
      },
      { time: 2000, warmupTime: 500, warmupIterations: 30, throws: true },
    )
    bench(
      'cold mount and two navigations with 200 nested-search links',
      async () => {
        await before()
        cleanup()
        router.history.destroy()
      },
      {
        time: 2000,
        warmupTime: 500,
        warmupIterations: 30,
        throws: true,
      },
    )
  }
})
