import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, expect, test, vi } from 'vitest'
import { fetchPost } from '../src/posts'
import { routeTree } from '../src/routeTree.gen'

// A client test has no server: the loader's server function call is answered
// by a module mock.
vi.mock('../src/posts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/posts')>()),
  fetchPost: vi.fn(async ({ data }: { data: string }) => ({
    id: data,
    title: 'Testing with TanStack Start',
  })),
}))

afterEach(() => {
  cleanup()
})

test('the route tree of the client has no server-only route', () => {
  const router = createRouter({ routeTree, history: createMemoryHistory() })

  expect(Object.keys(router.routesById).sort()).toEqual([
    '/',
    '/posts/$postId',
    '__root__',
  ])
})

test('a route renders what its loader gets from a server function', async () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/posts/42'] }),
  })

  render(<RouterProvider router={router} />)

  expect((await screen.findByRole('heading')).textContent).toBe(
    'Testing with TanStack Start',
  )
  expect(fetchPost).toHaveBeenCalledWith({ data: '42' })
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
