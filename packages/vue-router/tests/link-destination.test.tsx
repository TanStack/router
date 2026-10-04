import * as Vue from 'vue'
import { cleanup, fireEvent, render, screen } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
} from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Renders `links` in the root route next to `/source/$id`, `/target/$id` and
 * `/visible/$id`. `builds()` counts the destination builds that stringify a
 * search carrying a `build` key, so a reused location does not count.
 */
function setup(links: () => any, initial = '/source/one') {
  const counted = vi.fn(defaultStringifySearch)
  const root = createRootRoute({
    component: () => (
      <>
        {links()}
        <Outlet />
      </>
    ),
  })
  const routes = ['/source/$id', '/target/$id', '/visible/$id'].map((path) =>
    createRoute({ getParentRoute: () => root, path }),
  )
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
    stringifySearch: (search) =>
      'build' in search ? counted(search) : defaultStringifySearch(search),
  })
  render(<RouterProvider router={router} />)
  const go = (id: string, extra?: object) =>
    router.navigate({ to: '/source/$id', params: { id }, ...extra } as any)
  return { router, go, builds: () => counted.mock.calls.length }
}

test('reactive params and search follow in-place mutations at the next navigation', async () => {
  const params = Vue.reactive({ id: 'one' })
  const search = Vue.reactive({ build: 1 })
  const { go } = setup(() => (
    <Link to="/target/$id" params={params} search={search} data-testid="link" />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/one?build=1')
  params.id = 'two'
  search.build = 2
  await go('two')
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/two?build=2')
  params.id = 'three'
  await go('three')
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/three?build=2')
})

test('inherited params and search rebuild on every navigation', async () => {
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={true as any}
      search={true as any}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/one')
  await go('two', { search: { page: 2 } })
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/two?page=2')
})

test('masked destinations follow their inputs', async () => {
  const params = Vue.reactive({ id: 'one' })
  const fixed = { id: 'fixed' }
  const mask = { to: '/visible/$id', params }
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={fixed}
      mask={mask as any}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/visible/one')
  params.id = 'two'
  await go('two')
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/visible/two')
})

test('switches a mounted Link between plain and reactive inputs', async () => {
  const live = Vue.ref(false)
  const params = Vue.reactive({ id: 'one' })
  const plain = { id: 'fixed' }
  const { go } = setup(() => (
    <Link
      to="/target/$id"
      params={live.value ? params : plain}
      data-testid="link"
    />
  ))
  const link = await screen.findByTestId('link')
  expect(link).toHaveAttribute('href', '/target/fixed')
  live.value = true
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/one')
  params.id = 'two'
  await go('two')
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/two')
  live.value = false
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/fixed')
})

test('never mutates frozen caller options', async () => {
  const params = Object.freeze({ id: 'fixed' })
  const search = Object.freeze({ build: 1 })
  const { go } = setup(() => (
    <Link to="/target/$id" params={params} search={search} data-testid="link" />
  ))
  const link = await screen.findByTestId('link')
  await go('two')
  await Vue.nextTick()
  expect(link).toHaveAttribute('href', '/target/fixed?build=1')
  expect(Object.keys(params)).toEqual(['id'])
})

test.each([
  ['inherited state', true],
  ['a state updater', (prev: any) => ({ label: `${prev.label}!` })],
])(
  'a click after a same-href, state-only navigation uses the new state (%s)',
  async (_, state) => {
    const fixed = { id: 'fixed' }
    const { router, go } = setup(() => (
      <Link
        to="/target/$id"
        params={fixed}
        state={state as any}
        data-testid="link"
      />
    ))
    const link = await screen.findByTestId('link')
    await go('one', { state: { label: 'next' } })
    await fireEvent.click(link)
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe('/target/fixed'),
    )
    expect(router.state.location.state).toMatchObject({
      label: state === true ? 'next' : 'next!',
    })
  },
)
