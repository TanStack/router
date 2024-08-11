import React from 'react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import combinate from 'combinate'

import {
  type BlockerFn,
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
  blockerFn: BlockerFn
  disabled?: boolean
  ignoreBlocker?: boolean
}

async function setup({ blockerFn, disabled, ignoreBlocker }: BlockerTestOpts) {
  const blockerFnTest = vi.fn(blockerFn)
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => {
      const navigate = useNavigate()
      useBlocker({ disabled, blockerFn })
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

  return { router, clickable: { link, button }, blockerFn: blockerFnTest }
}

const clickTarget = ['link' as const, 'button' as const]

describe('Blocker', () => {
  const doesNotBlockTextMatrix = combinate({
    opts: [
      {
        blockerFn: () => false,
        disabled: false,
        ignoreBlocker: undefined,
      },
      {
        blockerFn: async () => await new Promise((resolve) => resolve(false)),
        disabled: false,
        ignoreBlocker: false,
      },
      {
        blockerFn: () => true,
        disabled: true,
        ignoreBlocker: false,
      },
      {
        blockerFn: () => true,
        disabled: false,
        ignoreBlocker: true,
      },
    ],
    clickTarget,
  })
  test.each(doesNotBlockTextMatrix)(
    'does not block navigation with blockerFn = $flags.blockerFn, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable, blockerFn } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      expect(
        await screen.findByRole('heading', { name: 'Posts' }),
      ).toBeInTheDocument()
      expect(window.location.pathname).toBe('/posts')
      if (opts.ignoreBlocker || opts.disabled)
        expect(blockerFn).not.toHaveBeenCalled()
    },
  )

  const blocksTextMatrix = combinate({
    opts: [
      {
        blockerFn: () => true,
        disabled: false,
        ignoreBlocker: undefined,
      },
      {
        blockerFn: async () => await new Promise((resolve) => resolve(true)),
        disabled: false,
        ignoreBlocker: false,
      },
    ],
    clickTarget,
  })
  test.each(blocksTextMatrix)(
    'blocks navigation with condition = $flags.blockerFn, ignoreBlocker = $flags.ignoreBlocker, clickTarget = $clickTarget',
    async ({ opts, clickTarget }) => {
      const { clickable } = await setup(opts)

      fireEvent.click(clickable[clickTarget])
      await expect(
        screen.findByRole('header', { name: 'Posts' }),
      ).rejects.toThrow()
      expect(window.location.pathname).toBe('/')
    },
  )
})
