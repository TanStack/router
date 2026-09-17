import { createMemoryHistory } from '@tanstack/history'
import { expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

test('preserves masked navigation with an output rewrite that returns a new URL', async () => {
  const root = new BaseRootRoute()
  const routeTree = root.addChildren(
    ['/', '/first', '/second', '/pretty'].map(
      (path) =>
        new BaseRoute({
          getParentRoute: () => root,
          path,
          loader: () => path,
        }),
    ),
  )
  const history = createMemoryHistory({ initialEntries: ['/en/'] })
  const router = createTestRouter({
    routeTree,
    history,
    isServer: false,
    rewrite: {
      input: ({ url }) => {
        if (url.pathname.startsWith('/en/')) {
          url.pathname = url.pathname.slice(3)
        }
        return url
      },
      output: ({ url }) => {
        const rewritten = new URL(url)
        rewritten.pathname = `/en${rewritten.pathname}`
        return rewritten
      },
    },
  })
  await router.load()

  await router.navigate({ to: '/first', mask: { to: '/pretty' } })
  expect(router.state.matches.at(-1)?.loaderData).toBe('/first')
  expect(history.location.href).toBe('/en/pretty')
  expect(history.length).toBe(2)

  await router.navigate({ to: '/first', mask: { to: '/pretty' } })
  expect(router.state.matches.at(-1)?.loaderData).toBe('/first')
  expect(history.location.href).toBe('/en/pretty')
  expect(history.length).toBe(2)

  await router.navigate({ to: '/second', mask: { to: '/pretty' } })
  expect(router.state.matches.at(-1)?.loaderData).toBe('/second')
  expect(history.location.href).toBe('/en/pretty')
  expect(history.length).toBe(3)

  history.back()
  await router.load()
  expect(router.state.matches.at(-1)?.loaderData).toBe('/first')
  expect(history.location.href).toBe('/en/pretty')
})

test('navigates between masked routes with the same external output URL', async () => {
  const root = new BaseRootRoute()
  const routeTree = root.addChildren(
    ['/', '/first', '/second', '/pretty'].map(
      (path) =>
        new BaseRoute({
          getParentRoute: () => root,
          path,
          loader: () => path,
        }),
    ),
  )
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree,
    history,
    isServer: false,
    rewrite: {
      output: ({ url }) => {
        if (url.pathname === '/first' || url.pathname === '/second') {
          return new URL('https://external.example/shared')
        }
        return url
      },
    },
  })
  await router.load()

  await router.navigate({ to: '/first', mask: { to: '/pretty' } })
  expect(router.state.matches.at(-1)?.loaderData).toBe('/first')
  expect(history.location.href).toBe('/pretty')

  await router.navigate({ to: '/second', mask: { to: '/pretty' } })
  expect(router.state.matches.at(-1)?.loaderData).toBe('/second')
  expect(history.location.href).toBe('/pretty')
  expect(history.length).toBe(3)

  history.back()
  await router.load()
  expect(router.state.matches.at(-1)?.loaderData).toBe('/first')
})
