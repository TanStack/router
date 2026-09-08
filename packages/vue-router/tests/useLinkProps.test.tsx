import * as Vue from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/vue'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLinkProps,
} from '../src'
import { getIntersectionObserverMock } from './utils'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

test.each(['viewport', 'render'] as const)(
  'disposes functional useLinkProps subscriptions and %s effects',
  async (preload) => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      getIntersectionObserverMock({ observe, disconnect }),
    )
    const history = createMemoryHistory({ initialEntries: ['/'] })
    const rootRoute = createRootRoute()
    const router = createRouter({
      routeTree: rootRoute.addChildren([
        createRoute({ getParentRoute: () => rootRoute, path: '/' }),
        createRoute({ getParentRoute: () => rootRoute, path: '/target' }),
      ]),
      history,
      isServer: false,
    })
    await router.load()
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(undefined)
    const preloadRoute = vi
      .spyOn(router, 'preloadRoute')
      .mockResolvedValue(undefined)
    const store = router.stores.location
    const subscribe = store.subscribe.bind(store)
    const cleanups: Array<() => void> = []
    let active = 0
    const spy = vi.spyOn(store, 'subscribe').mockImplementation((listener) => {
      const subscription = subscribe(listener)
      active++
      let stopped = false
      const unsubscribe = () => {
        if (!stopped) {
          stopped = true
          active--
          subscription.unsubscribe()
        }
      }
      cleanups.push(unsubscribe)
      return { ...subscription, unsubscribe }
    })
    const options = Vue.reactive({
      to: 'https://example.com',
      preload,
      title: 'first',
    })
    const FunctionalLink = () =>
      Vue.h('a', { ...Vue.unref(useLinkProps(options)) }, 'Functional link')
    const view = render(
      <RouterContextProvider router={router}>
        <FunctionalLink />
      </RouterContextProvider>,
    )
    try {
      const link = view.getByRole('link', { name: 'Functional link' })
      expect(link).toHaveAttribute('href', 'https://example.com')
      expect(active).toBe(0)
      expect(observe).not.toHaveBeenCalled()

      options.to = '/target'
      await Vue.nextTick()
      expect(link).toHaveAttribute('href', '/target')
      expect(active).toBe(1)

      for (const title of ['second', 'third']) {
        options.title = title
        await Vue.nextTick()
        expect(link).toHaveAttribute('title', title)
        expect(active).toBe(1)
      }
      store.set(router.buildLocation({ to: '/target' }))
      await Vue.nextTick()
      expect(link).toHaveAttribute('data-status', 'active')
      expect(active).toBe(1)
      await fireEvent.click(link)
      expect(navigate).toHaveBeenCalledOnce()

      if (preload === 'viewport') {
        expect(observe.mock.calls.length - disconnect.mock.calls.length).toBe(1)
      } else {
        expect(preloadRoute).toHaveBeenCalled()
      }
      view.unmount()
      expect(active).toBe(0)
      expect(disconnect).toHaveBeenCalledTimes(observe.mock.calls.length)
      preloadRoute.mockClear()
      options.to = '/'
      await Vue.nextTick()
      expect(preloadRoute).not.toHaveBeenCalled()
      expect(active).toBe(0)
    } finally {
      view.unmount()
      for (const unsubscribe of cleanups) {
        unsubscribe()
      }
      spy.mockRestore()
      navigate.mockRestore()
      preloadRoute.mockRestore()
      history.destroy()
    }
  },
)
