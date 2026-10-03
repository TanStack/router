import * as Vue from 'vue'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  retainSearchParams,
} from '../src'

afterEach(cleanup)

async function setup(stringifySearch = defaultStringifySearch) {
  const root = createRootRoute({ validateSearch: (search) => search })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/items/$id' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/items/source'] }),
    stringifySearch,
  })
  await router.load()
  return router
}

function query(link: Element) {
  return new URL(link.getAttribute('href')!, 'https://example.com').searchParams
}

test('same reactive params and nested search objects refresh their destination after in-place changes', async () => {
  const router = await setup()
  const params = Vue.reactive({ id: 'first' })
  const search = Vue.reactive({ filter: { term: 'first', enabled: true } })
  const Parent = Vue.defineComponent({
    setup: () => () => (
      <RouterContextProvider router={router}>
        <Link to="/items/$id" params={params} search={search}>
          reactive destination
        </Link>
      </RouterContextProvider>
    ),
  })
  const view = render(Parent)
  const link = view.getByText('reactive destination')
  expect(
    new URL(link.getAttribute('href')!, 'https://example.com').pathname,
  ).toBe('/items/first')
  expect(JSON.parse(query(link).get('filter')!)).toEqual({
    term: 'first',
    enabled: true,
  })

  params.id = 'second'
  search.filter.term = 'second'
  search.filter.enabled = false
  await waitFor(() => {
    expect(
      new URL(link.getAttribute('href')!, 'https://example.com').pathname,
    ).toBe('/items/second')
    expect(JSON.parse(query(link).get('filter')!)).toEqual({
      term: 'second',
      enabled: false,
    })
  })
  expect(view.getByText('reactive destination')).toBe(link)
})

test('stable params and search updater functions keep dependencies on captured Vue refs', async () => {
  const router = await setup()
  const id = Vue.ref('first')
  const page = Vue.ref(1)
  let paramsCalls = 0
  let searchCalls = 0
  const params = () => {
    paramsCalls++
    return { id: id.value }
  }
  const search = () => {
    searchCalls++
    return { page: page.value }
  }
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/$id" params={params} search={search}>
        ref destination
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('ref destination')
  expect(link).toHaveAttribute('href', '/items/first?page=1')
  const initialParamsCalls = paramsCalls
  const initialSearchCalls = searchCalls
  expect(initialParamsCalls).toBeGreaterThan(0)
  expect(initialSearchCalls).toBeGreaterThan(0)

  id.value = 'second'
  page.value = 2
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/items/second?page=2'),
  )
  expect(paramsCalls).toBe(initialParamsCalls + 1)
  expect(searchCalls).toBe(initialSearchCalls + 1)
  await fireEvent.click(link)
  await waitFor(() =>
    expect(router.state.location.href).toBe('/items/second?page=2'),
  )
})

test('Vue dependencies read by the router search formatter still invalidate a Link destination', async () => {
  const format = Vue.ref('first')
  const router = await setup((search) =>
    defaultStringifySearch({ ...search, format: format.value }),
  )
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/$id" params={{ id: 'target' }} search={{ page: 1 }}>
        formatted destination
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('formatted destination')
  expect(link).toHaveAttribute('href', '/items/target?page=1&format=first')
  format.value = 'second'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/items/target?page=1&format=second'),
  )
})

test('a retained updater tracks Vue dependencies first read after its router source changes', async () => {
  const router = await setup()
  const first = Vue.ref('first')
  const second = Vue.ref('second')
  const search = (previous: Record<string, unknown>) => ({
    value: previous.alternate ? second.value : first.value,
  })
  const view = render(
    <RouterContextProvider router={router}>
      <Link to="/items/$id" params={{ id: 'target' }} search={search}>
        conditional dependency
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('conditional dependency')
  expect(link).toHaveAttribute('href', '/items/target?value=first')
  await router.navigate({
    to: '/items/$id',
    params: { id: 'source' },
    search: { alternate: true },
  })
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/items/target?value=second'),
  )
  second.value = 'changed'
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/items/target?value=changed'),
  )
  expect(view.getByText('conditional dependency')).toBe(link)
})

test('a literal explicit undefined clears an inherited search value rather than matching an absent key', async () => {
  type Search = { keep?: string }
  const root = createRootRoute({
    validateSearch: (search): Search => ({
      keep: typeof search.keep === 'string' ? search.keep : undefined,
    }),
    search: { middlewares: [retainSearchParams<Search>(['keep'])] },
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/source?keep=inherited'],
    }),
  })
  await router.load()
  const search = Vue.ref<{ keep?: string }>({})
  const Parent = Vue.defineComponent({
    setup: () => () => (
      <RouterContextProvider router={router}>
        <Link to="/target" search={search.value}>
          undefined destination
        </Link>
      </RouterContextProvider>
    ),
  })
  const view = render(Parent)
  const link = view.getByText('undefined destination')
  expect(link).toHaveAttribute('href', '/target?keep=inherited')
  search.value = { keep: undefined }
  await waitFor(() => expect(link).toHaveAttribute('href', '/target'))
  search.value = {}
  await waitFor(() =>
    expect(link).toHaveAttribute('href', '/target?keep=inherited'),
  )
})
