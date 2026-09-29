import * as Vue from 'vue'
import { cleanup, render, screen, waitFor } from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'

afterEach(cleanup)

test('a mounted custom link recovers from an initial option getter error and follows navigation', async () => {
  const failed = Vue.ref(true)
  const error = new Error('Destination options are not ready')
  const capture = vi.fn((_error: unknown) => false)
  const setupLink = vi.fn()
  const updateSearch = (search: { marker?: string }) => ({
    marker: search.marker,
  })
  const CustomLink = Vue.defineComponent({
    setup() {
      setupLink()
      const props = useLinkProps({
        to: '/target',
        get search() {
          if (failed.value) {
            throw error
          }
          return updateSearch
        },
      })
      return () =>
        failed.value
          ? Vue.h('p', 'Waiting for destination options')
          : Vue.h('a', { ...Vue.unref(props) }, 'Recovered destination')
    },
  })
  const Boundary = Vue.defineComponent({
    setup() {
      Vue.onErrorCaptured(capture)
      return () => Vue.h(CustomLink)
    },
  })
  const root = createRootRoute({
    validateSearch: (search) => ({ marker: String(search.marker || '') }),
  })
  const history = createMemoryHistory({
    initialEntries: ['/source?marker=before'],
  })
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/source' }),
      createRoute({ getParentRoute: () => root, path: '/target' }),
    ]),
    history,
  })
  try {
    await router.load()
    render(Vue.h(RouterContextProvider, { router }, () => Vue.h(Boundary)))
    expect(screen.getByText('Waiting for destination options')).toBeVisible()
    expect(capture).toHaveBeenCalled()
    expect(capture.mock.calls[0]?.[0]).toBe(error)

    failed.value = false
    const link = await screen.findByRole('link', {
      name: 'Recovered destination',
    })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?marker=before'),
    )
    expect(setupLink).toHaveBeenCalledTimes(1)

    await router.navigate({ to: '/source', search: { marker: 'after' } })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', '/target?marker=after'),
    )
    expect(setupLink).toHaveBeenCalledTimes(1)
  } finally {
    cleanup()
    history.destroy()
  }
})
