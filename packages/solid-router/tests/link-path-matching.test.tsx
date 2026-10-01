import { createSignal } from 'solid-js'
import { cleanup, fireEvent, render, waitFor } from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '../src'
import { linkPathCases } from './link-path-cases'

afterEach(cleanup)

test('click uses the current replace option when the destination stays the same', async () => {
  const [replace, setReplace] = createSignal(false)
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const push = vi.spyOn(history, 'push')
  const replaceHistory = vi.spyOn(history, 'replace')
  const router = createRouter({
    routeTree: createRootRoute(),
    history,
    isServer: false,
  })
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link to="/posts" replace={replace()}>
          Posts
        </Link>
      )}
    </RouterContextProvider>
  ))
  const link = container.querySelector('a')!

  fireEvent.click(link)
  await waitFor(() => expect(router.state.location.pathname).toBe('/posts'))
  expect(push).toHaveBeenCalledTimes(1)

  await router.navigate({ to: '/' })
  await waitFor(() => expect(router.state.location.pathname).toBe('/'))
  push.mockClear()
  replaceHistory.mockClear()
  setReplace(true)
  fireEvent.click(link)
  await waitFor(() => expect(router.state.location.pathname).toBe('/posts'))
  expect(replaceHistory).toHaveBeenCalledTimes(1)
  expect(push).not.toHaveBeenCalled()
})

test('unrelated navigation does not rebuild a fixed inactive Link', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    isServer: false,
  })
  const build = vi.spyOn(router, 'buildLocation')
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => <Link to="/posts/1">Fixed</Link>}
    </RouterContextProvider>
  ))
  const link = container.querySelector('a')!
  const fixedBuilds = () =>
    build.mock.calls.filter(([options]) => options.to === '/posts/1').length

  await router.navigate({ to: '/posts/2' })
  await waitFor(() => expect(link).not.toHaveAttribute('aria-current'))
  const initialBuilds = fixedBuilds()
  await router.navigate({ to: '/posts/3' })

  expect(link).toHaveAttribute('href', '/posts/1')
  expect(link).not.toHaveAttribute('aria-current')
  expect(fixedBuilds()).toBe(initialBuilds)
})

test('router options update a fixed Link after navigation', async () => {
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/1'] }),
    trailingSlash: 'never' as 'never' | 'always',
    isServer: false,
  })
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => <Link to="/posts/1">Fixed</Link>}
    </RouterContextProvider>
  ))
  const link = container.querySelector('a')!
  expect(link).toHaveAttribute('href', '/posts/1')

  router.update({ trailingSlash: 'always' })
  await router.navigate({ to: '/posts/2' })
  await waitFor(() => expect(link).toHaveAttribute('href', '/posts/1/'))
})

test('function-valued search is rebuilt after unrelated navigation', async () => {
  let value = 'one'
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: false,
  })
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link to="/posts" search={() => ({ value })}>
          Posts
        </Link>
      )}
    </RouterContextProvider>
  ))
  const link = container.querySelector('a')!
  expect(link).toHaveAttribute('href', '/posts?value=one')

  value = 'two'
  await router.navigate({ to: '/other' })
  await waitFor(() => expect(link).toHaveAttribute('href', '/posts?value=two'))
})

for (const basepath of ['', '/app']) {
  test.each(linkPathCases)(
    `pathname matching with basepath "${basepath}": $current -> $to, exact=$exact`,
    ({ current, to, exact, active }) => {
      const router = createRouter({
        routeTree: createRootRoute(),
        history: createMemoryHistory({ initialEntries: [basepath + current] }),
        basepath,
        trailingSlash: 'preserve',
        isServer: false,
      })
      const { container } = render(() => (
        <RouterContextProvider router={router}>
          {() => (
            <Link
              to={to}
              activeOptions={{ exact }}
              inactiveProps={{ class: 'inactive' }}
            >
              {({ isActive }) => String(isActive)}
            </Link>
          )}
        </RouterContextProvider>
      ))
      const anchor = container.querySelector('a')!
      expect(anchor.textContent).toBe(String(active))
      expect(anchor.getAttribute('aria-current')).toBe(active ? 'page' : null)
      expect(anchor.className).toBe(active ? 'active' : 'inactive')
    },
  )
}

test('pathname matching reacts when exact mode changes', () => {
  const [exact, setExact] = createSignal(true)
  const router = createRouter({
    routeTree: createRootRoute(),
    history: createMemoryHistory({ initialEntries: ['/posts/item'] }),
    isServer: false,
  })
  const { container } = render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link
          to="/posts"
          activeOptions={{ exact: exact() }}
          inactiveProps={{ class: 'inactive' }}
        >
          {({ isActive }) => String(isActive)}
        </Link>
      )}
    </RouterContextProvider>
  ))
  const anchor = container.querySelector('a')!
  for (const mode of [true, false, true]) {
    setExact(mode)
    expect(anchor.textContent).toBe(String(!mode))
    expect(anchor.getAttribute('aria-current')).toBe(mode ? null : 'page')
    expect(anchor.className).toBe(mode ? 'inactive' : 'active')
  }
})
