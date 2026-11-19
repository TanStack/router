import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterProvider,
  createMemoryHistory,
  createRouter,
} from '@tanstack/react-router'
import { mockServerFn } from '@tanstack/react-start/testing'
import { afterEach, expect, test } from 'vitest'
import { fetchPost } from '../src/posts'
import { routeTree } from '../src/routeTree.gen'

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
  mockServerFn(fetchPost, ({ data }) => ({
    id: data,
    title: 'Testing with TanStack Start',
  }))
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/posts/42'] }),
  })

  render(<RouterProvider router={router} />)

  expect((await screen.findByRole('heading')).textContent).toBe(
    'Testing with TanStack Start',
  )
  expect(globalThis.__SERVER_ONLY_MODULE_LOADED__).toBeUndefined()
})
