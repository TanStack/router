import React from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(cleanup)

describe('mount canonicalization preserves history', () => {
  test.each([
    { search: '', page: 1, replaces: 1 },
    { search: '?page=02', page: 2, replaces: 1 },
    { search: '?page=2', page: 2, replaces: 0 },
  ])(
    'preserves state, hash and Back for $search',
    async ({ search, page, replaces }) => {
      const history = createMemoryHistory({ initialEntries: ['/previous'] })
      history.push(`/target${search}#keep`, { marker: 'keep' })
      const actions: Array<string> = []
      const unsubscribe = history.subscribe(({ action }) =>
        actions.push(action.type),
      )
      const loader = vi.fn(() => 'Loaded target')
      const root = createRootRoute({ component: Outlet })
      const previous = createRoute({
        getParentRoute: () => root,
        path: '/previous',
        component: () => <div>Previous page</div>,
      })
      const target = createRoute({
        getParentRoute: () => root,
        path: '/target',
        validateSearch: (input) => ({ page: Number(input.page) || 1 }),
        loader,
        component: () => <div>{target.useLoaderData()}</div>,
      })
      const router = createRouter({
        routeTree: root.addChildren([previous, target]),
        history,
      })
      render(
        <React.StrictMode>
          <RouterProvider router={router} />
        </React.StrictMode>,
      )

      await screen.findByText('Loaded target')
      expect(history.location.href).toBe(`/target?page=${page}#keep`)
      expect(history.location.state).toMatchObject({ marker: 'keep' })
      expect(history.length).toBe(2)
      expect(actions).toEqual(Array.from({ length: replaces }, () => 'REPLACE'))
      expect(loader).toHaveBeenCalledTimes(1)
      expect(router.state.status).toBe('idle')

      await act(async () => {
        history.back()
      })
      await screen.findByText('Previous page')
      expect(history.location.href).toBe('/previous')
      unsubscribe()
      history.destroy()
    },
  )
})
