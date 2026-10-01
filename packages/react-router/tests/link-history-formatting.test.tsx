import React from 'react'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '../src'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

async function renderInactiveLink(history: RouterHistory) {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
  })
  await router.load()
  // Keep the parent independent of navigation so only the Link subscription
  // can refresh its cached href.
  const view = render(
    <RouterContextProvider router={router}>
      <Link
        to="/target"
        search={{}}
        hash=""
        activeOptions={{ includeSearch: false }}
      >
        Target
      </Link>
    </RouterContextProvider>,
  )
  const link = view.getByText('Target')
  expect(link).not.toHaveAttribute('aria-current')
  return { router, link }
}

test('an inactive hash-history Link refreshes when only the outer URL changes', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/shell?outer=one#/source')
  const history = createHashHistory()
  try {
    const { router, link } = await renderInactiveLink(history)
    expect(link).toHaveAttribute('href', '/shell?outer=one#/target')

    for (const outer of ['/other?outer=one', '/other?outer=two']) {
      await act(async () => {
        window.history.replaceState(null, '', `${outer}#/source`)
        await router.load()
      })
      expect(router.state.location.pathname).toBe('/source')
      expect(link).toHaveAttribute('href', `${outer}#/target`)
      expect(link).not.toHaveAttribute('aria-current')
    }
  } finally {
    cleanup()
    history.destroy()
    window.history.replaceState(null, '', original)
  }
})

test('a cached inactive Link follows a custom formatter callback output', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/source')
  let prefix = '/first'
  const history = createBrowserHistory({
    createHref: (path) => prefix + path,
  })
  try {
    const { router, link } = await renderInactiveLink(history)
    expect(link).toHaveAttribute('href', '/first/target')

    prefix = '/second'
    await act(async () => {
      window.history.replaceState(null, '', '/source?step=1')
      await router.load()
    })
    expect(link).toHaveAttribute('href', '/second/target')
    expect(link).not.toHaveAttribute('aria-current')
  } finally {
    cleanup()
    history.destroy()
    window.history.replaceState(null, '', original)
  }
})

test('a cached inactive Link validates a replaced history formatter and recovers', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  const history = createMemoryHistory({ initialEntries: ['/source'] })
  const { router, link } = await renderInactiveLink(history)
  expect(link).toHaveAttribute('href', '/target')

  for (const href of ['/formatted', 'javascript:blocked()', '/recovered']) {
    history.createHref = () => href
    await act(async () => {
      history.replace('/source')
      await router.load()
    })
    expect(router.state.location.pathname).toBe('/source')
    expect(link).not.toHaveAttribute('aria-current')
    if (href.startsWith('javascript:')) {
      expect(link).not.toHaveAttribute('href')
      expect(link).toHaveAttribute('aria-disabled', 'true')
      const navigate = vi.spyOn(router, 'navigate')
      fireEvent.click(link)
      expect(navigate).not.toHaveBeenCalled()
      navigate.mockRestore()
    } else {
      expect(link).toHaveAttribute('href', href)
      expect(link).not.toHaveAttribute('aria-disabled')
    }
  }
})
