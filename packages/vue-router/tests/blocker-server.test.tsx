import * as Vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/vue'
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
  const Observer = Vue.defineComponent({
    setup() {
      const state = useBlocker({
        shouldBlockFn: () => true,
        withResolver: true,
      })
      return () => <span>{state.value.status}</span>
    },
  })
  render(
    <RouterContextProvider router={router}>
      <Observer />
    </RouterContextProvider>,
  )
  await screen.findByText('idle')
  expect(block).not.toHaveBeenCalled()
})
