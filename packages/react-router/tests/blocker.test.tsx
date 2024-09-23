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
  redirect,
  useBlocker,
  useNavigate,
} from '../src'

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
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
    component: function Setup() {
      const navigate = useNavigate()
      useBlocker({ condition, blockerFn })
      return (
        <React.Fragment>
          <h1>Index</h1>
          <Link to="/posts" ignoreBlocker={ignoreBlocker}>
            link to posts
          </Link>
          <Link to="/foo">link to foo</Link>
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

  const fooRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/foo',
    beforeLoad: () => {
      throw redirect({ to: '/bar' })
    },
    component: () => (
      <React.Fragment>
        <h1>Foo</h1>
      </React.Fragment>
    ),
  })

  const barRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/bar',
    component: () => (
      <React.Fragment>
        <h1>Bar</h1>
      </React.Fragment>
    ),
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      postsRoute,
      fooRoute,
      barRoute,
    ]),
  })

  render(<RouterProvider router={router} />)
  expect(window.location.pathname).toBe('/')

  const postsLink = await screen.findByRole('link', { name: 'link to posts' })
  const fooLink = await screen.findByRole('link', { name: 'link to foo' })
  const button = await screen.findByRole('button', { name: 'button' })

  return { router, clickable: { postsLink, fooLink, button }, blockerFn }
}

const clickTarget = ['postsLink' as const, 'button' as const]

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

  test('blocker function is only called once when navigating to a route that redirects', async () => {
    const { clickable, blockerFn } = await setup({
      condition: true,
      ignoreBlocker: false,
    })
    blockerFn.mockImplementationOnce(() => true).mockImplementation(() => false)
    fireEvent.click(clickable.fooLink)
    expect(
      await screen.findByRole('heading', { name: 'Bar' }),
    ).toBeInTheDocument()
    expect(window.location.pathname).toBe('/bar')
  })
})
