import * as React from 'react'
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '../src'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test('outgoing Links retain their source during a document redirect and catch up after cancelled unload', async () => {
  const root = createRootRoute({
    validateSearch: (search) => ({ value: String(search.value ?? '') }),
    component: Outlet,
  })
  const a = createRoute({
    getParentRoute: () => root,
    path: '/a',
    component: function A() {
      const [show, setShow] = React.useState(false)
      return (
        <>
          <Link to="/a" search={true} data-testid="existing" />
          <button
            onClick={() => {
              void router.navigate({ to: '/b', search: { value: 'b' } })
            }}
          >
            Attempt document redirect
          </button>
          <button onClick={() => setShow(true)}>Mount outgoing Link</button>
          {show && <Link to="/a" search={true} data-testid="cold" />}
        </>
      )
    },
  })
  const b = createRoute({
    getParentRoute: () => root,
    path: '/b',
    beforeLoad: () => {
      throw redirect({
        href: 'https://example.com/leave',
        reloadDocument: true,
      })
    },
  })
  const history = createMemoryHistory({ initialEntries: ['/a?value=a'] })
  const router = createRouter({
    routeTree: root.addChildren([a, b]),
    history,
    defaultPendingMs: Infinity,
  })
  render(<RouterProvider router={router} />)
  await screen.findByRole('button', { name: 'Mount outgoing Link' })

  const browserWindow = window
  const cancelUnload = (event: Event) => event.preventDefault()
  browserWindow.addEventListener('beforeunload', cancelUnload)
  // Model the browser retaining this document when an independent native
  // beforeunload listener cancels the redirect. Router state remains untouched.
  const replace = vi.fn(() => {
    expect(screen.getByTestId('existing')).toHaveAttribute('href', '/a?value=a')
    const event = new browserWindow.Event('beforeunload', { cancelable: true })
    expect(browserWindow.dispatchEvent(event)).toBe(false)
  })
  vi.stubGlobal(
    'window',
    new Proxy(browserWindow, {
      get(target, key) {
        return key === 'location'
          ? { href: browserWindow.location.href, replace }
          : Reflect.get(target, key, target)
      },
    }),
  )
  try {
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Attempt document redirect' }),
      )
      await waitFor(() => expect(replace).toHaveBeenCalledOnce())
    })
    expect(replace).toHaveBeenCalledWith('https://example.com/leave')
    expect(router.state.location.pathname).toBe('/b')
    expect(router.state.resolvedLocation?.pathname).toBe('/a')
    fireEvent.click(screen.getByRole('button', { name: 'Mount outgoing Link' }))
    expect(screen.getByTestId('existing')).toHaveAttribute('href', '/a?value=b')
    expect(screen.getByTestId('cold')).toHaveAttribute('href', '/a?value=b')
  } finally {
    browserWindow.removeEventListener('beforeunload', cancelUnload)
    history.destroy()
  }
})
