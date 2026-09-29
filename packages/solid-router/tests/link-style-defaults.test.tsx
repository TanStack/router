import * as Solid from 'solid-js'
import { cleanup, render, screen, waitFor } from '@solidjs/testing-library'
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

test('undefined restores default link styling while null explicitly removes it', async () => {
  const root = createRootRoute()
  const index = createRoute({ getParentRoute: () => root, path: '/' })
  const other = createRoute({ getParentRoute: () => root, path: '/other' })
  const router = createRouter({
    routeTree: root.addChildren([index, other]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  const [stateProps, setStateProps] = Solid.createSignal<
    { class: string } | null | undefined
  >(undefined)
  render(() => (
    <RouterContextProvider router={router}>
      {() => (
        <>
          <Link to="/" activeProps={stateProps() as any}>
            Active
          </Link>
          <Link to="/other" inactiveProps={stateProps() as any}>
            Inactive
          </Link>
        </>
      )}
    </RouterContextProvider>
  ))
  const active = screen.getByRole('link', { name: 'Active' })
  const inactive = screen.getByRole('link', { name: 'Inactive' })
  expect(active).toHaveClass('active')
  expect(inactive).not.toHaveClass('active')

  setStateProps(null)
  await waitFor(() => expect(active).not.toHaveClass('active'))
  expect(active).toHaveAttribute('aria-current', 'page')

  setStateProps({ class: 'custom' })
  await waitFor(() => expect(active).toHaveClass('custom'))
  expect(inactive).toHaveClass('custom')

  setStateProps(undefined)
  await waitFor(() => expect(active).toHaveClass('active'))
  expect(active).not.toHaveClass('custom')
  expect(inactive).not.toHaveClass('custom')
})
