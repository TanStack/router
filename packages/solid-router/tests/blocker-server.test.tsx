import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@solidjs/testing-library'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  useBlocker,
} from '../src'

afterEach(cleanup)

test('a server router does not register navigation blockers', async () => {
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const block = vi.spyOn(history, 'block')
  const router = createRouter({
    routeTree: createRootRoute(),
    history,
    isServer: true,
  })
  function Observer() {
    const state = useBlocker({ shouldBlockFn: () => true, withResolver: true })
    return <span>{state().status}</span>
  }
  render(() => (
    <RouterContextProvider router={router}>
      {() => <Observer />}
    </RouterContextProvider>
  ))
  await screen.findByText('idle')
  expect(block).not.toHaveBeenCalled()
})
