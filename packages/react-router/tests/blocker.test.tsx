import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import combinate from 'combinate'

import {
  Link,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useBlocker,
  useNavigate,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  cleanup()
})

interface BlockerTestOpts {
  condition: boolean
  ignoreBlocker?: boolean
}
async function setup({ condition, ignoreBlocker }: BlockerTestOpts) {
  const blockerFn = vi.fn()
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      const navigate = useNavigate()
      useBlocker({ condition, blockerFn })
      return (
        <React.Fragment>
          <h1>Index</h1>
          <Link to="/posts" ignoreBlocker={ignoreBlocker}>
            link
          </Link>
          <button onClick={() => navigate({ to: '/posts', ignoreBlocker })}>
            button
          </button>
        </React.Fragment>
      )
    },
  })

  const postsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/posts',
    component: () => (
      <React.Fragment>
        <h1>Posts</h1>
      </React.Fragment>
    ),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, postsRoute]),
  })

  render(<RouterProvider router={router} />)
  expect(window.location.pathname).toBe('/')

  const link = await screen.findByRole('link', { name: 'link' })
  const button = await screen.findByRole('button', { name: 'button' })

  return { router, clickable: { link, button }, blockerFn }
}

const clickTarget = ['link' as const, 'button' as const]

describe('Blocker', () => {
  const doesNotBlockTextMatrix = combinate({
    opts: [
      { condition: false, ignoreBlocker: undefined },
      { condition: false, ignoreBlocker: false },
      { condition: false, ignoreBlocker: true },
      { condition: true, ignoreBlocker: true },
    ],
    clickTarget,
  })
  test.each(doesNotBlockTextMatrix)(
    'does not block navigation with condition = $flags.condition, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable, blockerFn } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      expect(
        await screen.findByRole('heading', { name: 'Posts' }),
      ).toBeInTheDocument()
      expect(window.location.pathname).toBe('/posts')
      expect(blockerFn).not.toHaveBeenCalled()
    },
  )

  const blocksTextMatrix = combinate({
    opts: [
      { condition: true, ignoreBlocker: undefined },
      { condition: true, ignoreBlocker: false },
    ],
    clickTarget,
  })
  test.each(blocksTextMatrix)(
    'blocks navigation with condition = $flags.condition, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable, blockerFn } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      await expect(
        screen.findByRole('header', { name: 'Posts' }),
      ).rejects.toThrow()
      expect(window.location.pathname).toBe('/')
      expect(blockerFn).toHaveBeenCalledOnce()
    },
  )
})
