import React from 'react'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

async function setup() {
  const root = createRootRoute({
    validateSearch: (search) => ({ page: Number(search.page || 1) }),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/items/$id' }),
    ]),
    history: createMemoryHistory({
      initialEntries: ['/items/one?page=1#first'],
    }),
  })
  await router.load()
  return router
}

const cases = [false, true].flatMap((functionalSearch) =>
  [false, true].flatMap((functionalHash) =>
    [false, true].flatMap((includeSearch) =>
      [false, true].map((includeHash) => ({
        functionalSearch,
        functionalHash,
        includeSearch,
        includeHash,
      })),
    ),
  ),
)

test.each(cases)(
  'activity follows its options with functional search=$functionalSearch, functional hash=$functionalHash, includeSearch=$includeSearch, includeHash=$includeHash',
  async ({ functionalSearch, functionalHash, includeSearch, includeHash }) => {
    const router = await setup()
    // Functional inputs deliberately return fixed values: the destination
    // remains constant while pathname, search and hash activity each change.
    const view = render(
      <RouterContextProvider router={router}>
        <Link
          to="/items/$id"
          params={() => ({ id: 'one' })}
          search={functionalSearch ? () => ({ page: 1 }) : { page: 1 }}
          hash={functionalHash ? () => 'first' : 'first'}
          activeOptions={{ exact: true, includeSearch, includeHash }}
        >
          Fixed destination
        </Link>
      </RouterContextProvider>,
    )
    const link = view.getByRole('link', { name: 'Fixed destination' })
    expect(link).toHaveAttribute('aria-current', 'page')

    for (const [id, page, hash] of [
      ['two', 1, 'first'],
      ['one', 1, 'first'],
      ['one', 2, 'first'],
      ['one', 1, 'first'],
      ['one', 1, 'second'],
      ['one', 1, 'first'],
    ] as const) {
      await act(() =>
        router.navigate({
          to: '/items/$id',
          params: { id },
          search: { page },
          hash,
        }),
      )
      const active =
        id === 'one' &&
        (!includeSearch || page === 1) &&
        (!includeHash || hash === 'first')
      expect(link).toHaveAttribute('href', '/items/one?page=1#first')
      expect(link.getAttribute('aria-current')).toBe(active ? 'page' : null)
    }
  },
)

test('a persistent Link starts and stops following hash activity when its options change', async () => {
  const router = await setup()
  const params = () => ({ id: 'one' })
  const search = () => ({ page: 1 })
  function tree(includeHash: boolean) {
    return (
      <RouterContextProvider router={router}>
        <Link
          to="/items/$id"
          params={params}
          search={search}
          hash="first"
          activeOptions={{ includeHash }}
        >
          Retargeted activity
        </Link>
      </RouterContextProvider>
    )
  }
  const view = render(tree(false))
  const link = view.getByRole('link', { name: 'Retargeted activity' })
  const navigate = (hash: string, page = 1) =>
    act(() =>
      router.navigate({
        to: '/items/$id',
        params: { id: 'one' },
        search: { page },
        hash,
      }),
    )

  await navigate('second')
  expect(link).toHaveAttribute('aria-current', 'page')
  view.rerender(tree(true))
  expect(link).not.toHaveAttribute('aria-current')
  await navigate('first')
  expect(link).toHaveAttribute('aria-current', 'page')
  await navigate('second')
  expect(link).not.toHaveAttribute('aria-current')

  view.rerender(tree(false))
  expect(link).toHaveAttribute('aria-current', 'page')
  await navigate('first')
  expect(link).toHaveAttribute('aria-current', 'page')
  await navigate('second')
  expect(link).toHaveAttribute('aria-current', 'page')
  await navigate('second', 2)
  expect(link).not.toHaveAttribute('aria-current')
  expect(link).toHaveAttribute('href', '/items/one?page=1#first')
  expect(view.getByRole('link', { name: 'Retargeted activity' })).toBe(link)
})
