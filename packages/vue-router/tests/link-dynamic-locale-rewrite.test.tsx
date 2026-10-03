import * as Vue from 'vue'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { afterEach, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

const localeKey = 'tanstack-dynamic-rewrite-probe-locale'

afterEach(() => {
  cleanup()
  localStorage.removeItem(localeKey)
})

test.each(['href', 'preload', 'click'] as const)(
  'a retained Link refreshes its %s after the documented locale rewrite changes and a source publishes',
  async (phase) => {
    localStorage.setItem(localeKey, 'en')
    const params = {}
    const search = {}
    const preloads: Array<string> = []
    const root = createRootRoute({
      component: Vue.defineComponent({
        setup: () => () => (
          <>
            <Link
              to="/target"
              params={params}
              search={search}
              preload="intent"
              preloadDelay={0}
            >
              locale target
            </Link>
            <Outlet />
          </>
        ),
      }),
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source',
      component: () => <div>source content</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      beforeLoad: ({ preload, location }) => {
        if (preload) {
          preloads.push(location.publicHref)
        }
      },
      component: () => <div>target content</div>,
    })
    const history = createMemoryHistory({ initialEntries: ['/en/source'] })
    const router = createRouter({
      routeTree: root.addChildren([source, target]),
      history,
      rewrite: {
        input: ({ url }) => {
          const segments = url.pathname.split('/').filter(Boolean)
          if (segments[0] === 'en' || segments[0] === 'fr') {
            url.pathname = '/' + segments.slice(1).join('/')
          }
          return url
        },
        output: ({ url }) => {
          const locale = localStorage.getItem(localeKey) || 'en'
          url.pathname = `/${locale}${url.pathname === '/' ? '' : url.pathname}`
          return url
        },
      },
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    await waitFor(() => expect(router.state.status).toBe('idle'))
    const link = screen.getByRole('link', { name: 'locale target' })
    expect(link).toHaveAttribute('href', '/en/target')

    localStorage.setItem(localeKey, 'fr')
    await router.navigate({ to: '/source', hash: 'published' })
    await Vue.nextTick()
    expect(router.state.location.publicHref).toBe('/fr/source#published')
    expect(screen.getByRole('link', { name: 'locale target' })).toBe(link)

    // Separate phases expose event behavior even if the rendered href is stale.
    if (phase === 'href') {
      await waitFor(() => expect(link).toHaveAttribute('href', '/fr/target'))
    } else if (phase === 'preload') {
      await fireEvent.focus(link)
      await waitFor(() => expect(preloads).toEqual(['/fr/target']))
    } else {
      await fireEvent.click(link)
      await screen.findByText('target content')
      expect(router.state.location.publicHref).toBe('/fr/target')
      expect(history.location.href).toBe('/fr/target')
    }
  },
)
