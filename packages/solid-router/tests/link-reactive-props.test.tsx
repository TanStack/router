import * as Solid from 'solid-js'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const disposers: Array<() => void> = []
afterEach(() => {
  cleanup()
  for (const dispose of disposers.splice(0)) {
    dispose()
  }
})

async function createLoadedRouter() {
  const root = createRootRoute()
  const history = createMemoryHistory({ initialEntries: ['/'] })
  disposers.push(history.destroy)
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/' }),
      createRoute({ getParentRoute: () => root, path: '/other' }),
    ]),
    history,
    defaultPreload: false,
  })
  await router.load()
  return router
}

test('reactive tuple handlers receive their bound argument and can prevent navigation', async () => {
  const router = await createLoadedRouter()
  const navigate = vi.spyOn(router, 'navigate')
  const blocked = vi.fn((_value: string, event: MouseEvent) => {
    event.preventDefault()
  })
  const allowed = vi.fn((_value: string, _event: MouseEvent) => {})
  const [handler, setHandler] = Solid.createSignal<
    Solid.JSX.EventHandlerUnion<HTMLAnchorElement, MouseEvent>
  >([blocked, 'blocked argument'])
  render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <Link to="/other" onClick={handler()}>
          Destination
        </Link>
      )}
    </RouterContextProvider>
  ))
  const link = screen.getByRole('link', { name: 'Destination' })

  fireEvent.click(link)
  expect(blocked).toHaveBeenCalledExactlyOnceWith(
    'blocked argument',
    expect.any(MouseEvent),
  )
  expect(navigate).not.toHaveBeenCalled()
  expect(router.history.location.pathname).toBe('/')

  setHandler([allowed, 'allowed argument'])
  fireEvent.click(link)
  expect(allowed).toHaveBeenCalledExactlyOnceWith(
    'allowed argument',
    expect.any(MouseEvent),
  )
  expect(blocked).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledOnce()
  await waitFor(() => expect(router.history.location.pathname).toBe('/other'))
})

test('reactive spreads add and remove DOM attributes while keeping routing props out of the DOM', async () => {
  const router = await createLoadedRouter()
  const [props, setProps] = Solid.createSignal<{
    to: '/' | '/other'
    preload?: false
    replace?: boolean
    hash?: string
    title?: string
    'data-note'?: string
  }>({ to: '/' })
  render(() => (
    <RouterContextProvider router={router}>
      {() => <Link {...props()}>Spread</Link>}
    </RouterContextProvider>
  ))
  const link = screen.getByRole('link', { name: 'Spread' })
  expect(link).toHaveAttribute('href', '/')
  expect(link).not.toHaveAttribute('title')
  expect(link).not.toHaveAttribute('data-note')

  setProps({
    to: '/other',
    preload: false,
    replace: true,
    hash: 'section',
    title: 'Updated title',
    'data-note': 'added',
  })
  await waitFor(() => {
    expect(link).toHaveAttribute('href', '/other#section')
    expect(link).toHaveAttribute('title', 'Updated title')
    expect(link).toHaveAttribute('data-note', 'added')
  })
  for (const name of ['to', 'preload', 'replace', 'hash']) {
    expect(link).not.toHaveAttribute(name)
  }

  setProps({ to: '/' })
  await waitFor(() => {
    expect(link).toHaveAttribute('href', '/')
    expect(link).not.toHaveAttribute('title')
    expect(link).not.toHaveAttribute('data-note')
  })
})
