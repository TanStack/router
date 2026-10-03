import * as Vue from 'vue'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  defaultStringifySearch,
  useLinkProps,
} from '../src'
import type { AnyRouter } from '../src'
import type { ParsedHistoryState } from '@tanstack/history'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

test('a custom rewrite preserves render, intent and validated click without enriching frozen caller options', async () => {
  let preloads = 0
  const options = Object.freeze({
    to: '/target/$id',
    params: Object.freeze({ id: 'first' }),
    search: Object.freeze({}),
    preload: 'intent' as const,
    preloadDelay: 0,
  })
  const Navigation = Vue.defineComponent({
    setup() {
      const props = useLinkProps<AnyRouter, string, string>(options)
      return () => (
        <>
          <a {...Vue.unref(props)}>target</a>
          <Outlet />
        </>
      )
    },
  })
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target/$id',
    beforeLoad: ({ preload }) => {
      if (preload) {
        preloads++
      }
    },
    component: () => <div>target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
    rewrite: {
      output: ({ url }) => {
        return url
      },
    },
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('source content')
  await waitFor(() => expect(router.state.status).toBe('idle'))
  const link = screen.getByRole('link', { name: 'target' })
  expect(link).toHaveAttribute('href', '/target/first')
  await fireEvent.focus(link)
  await waitFor(() => expect(preloads).toBe(1))
  await fireEvent.click(link)
  await screen.findByText('target content')
  expect(router.state.location.pathname).toBe('/target/first')
  await router.navigate({ to: '/source' })
  await screen.findByText('source content')
  expect(screen.getByRole('link', { name: 'target' })).toBe(link)
  expect(link).toHaveAttribute('href', '/target/first')
  expect(Object.keys(options)).toEqual([
    'to',
    'params',
    'search',
    'preload',
    'preloadDelay',
  ])
  expect(options).not.toHaveProperty('_fromLocation')
  expect(options).not.toHaveProperty('_buildCache')
  expect(options).not.toHaveProperty('_includeValidateSearch')
})

test.each(['/', '/base'] as const)(
  'fixed destinations follow public router configuration updates with basepath %s',
  async (basepath) => {
    vi.stubEnv('NODE_ENV', 'production')
    let preloads = 0
    const options = Object.freeze({
      to: '/target',
      search: Object.freeze({}),
      preload: 'intent' as const,
      preloadDelay: 0,
    })
    const Navigation = Vue.defineComponent({
      setup() {
        const props = useLinkProps<AnyRouter, string, string>(options)
        return () => (
          <>
            <a {...Vue.unref(props)}>configured target</a>
            <Outlet />
          </>
        )
      },
    })
    const root = createRootRoute({
      validateSearch: (search) => search,
      component: Navigation,
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source',
      component: () => <div>configured source</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target',
      beforeLoad: ({ preload }) => {
        if (preload) {
          preloads++
        }
      },
      component: () => <div>configured target content</div>,
    })
    const prefix = basepath === '/' ? '' : basepath
    const router: AnyRouter = createRouter({
      routeTree: root.addChildren([source, target]),
      basepath,
      history: createMemoryHistory({ initialEntries: [`${prefix}/source`] }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('configured source')
    const link = screen.getByRole('link', { name: 'configured target' })
    expect(link).toHaveAttribute('href', `${prefix}/target`)
    router.update({
      stringifySearch: (search) =>
        defaultStringifySearch({ ...search, format: 'custom' }),
    })
    await router.navigate({ to: '/source', search: { revision: 1 } })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `${prefix}/target?format=custom`),
    )
    router.update({
      stringifySearch: defaultStringifySearch,
      trailingSlash: 'always',
    })
    await router.navigate({ to: '/source', search: { revision: 2 } })
    await waitFor(() =>
      expect(link).toHaveAttribute('href', `${prefix}/target/`),
    )
    expect(screen.getByRole('link', { name: 'configured target' })).toBe(link)
    await fireEvent.focus(link)
    await waitFor(() => expect(preloads).toBe(1))
    await fireEvent.click(link)
    await screen.findByText('configured target content')
    expect(router.history.location.pathname).toBe(`${prefix}/target/`)
    expect(Object.isFrozen(options)).toBe(true)
    expect(Object.keys(options)).toEqual([
      'to',
      'search',
      'preload',
      'preloadDelay',
    ])
  },
)

test('user event handlers update the destination before preload and the destination and controls before click', async () => {
  const visits: Array<string> = []
  const options = Vue.reactive({
    to: '/target',
    search: { visit: 'render' },
    preload: 'intent' as const,
    preloadDelay: 0,
    replace: false,
    onFocus: () => {
      options.search.visit = 'preload'
    },
    onClick: () => {
      options.search.visit = 'click'
      options.replace = true
    },
  })
  const Navigation = Vue.defineComponent({
    setup() {
      const props = useLinkProps<AnyRouter, string, string>(options)
      return () => (
        <>
          <a {...Vue.unref(props)}>target</a>
          <Outlet />
        </>
      )
    },
  })
  const root = createRootRoute({
    validateSearch: (value: Record<string, unknown>) => value,
    component: Navigation,
  })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    beforeLoad: ({ preload, search }) => {
      visits.push(`${preload ? 'preload' : 'navigate'}:${search.visit}`)
    },
    component: () => <div>target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('source content')
  const link = screen.getByRole('link', { name: 'target' })
  expect(link).toHaveAttribute('href', '/target?visit=render')
  await fireEvent.focus(link)
  await waitFor(() => expect(visits).toContain('preload:preload'))
  const historyLength = router.history.length
  await fireEvent.click(link)
  await screen.findByText('target content')
  expect(visits).toContain('navigate:click')
  expect(router.state.location.href).toBe('/target?visit=click')
  expect(router.history.length).toBe(historyLength)
})

test('a replace-only prop update preserves queued intent but uses the current click control', async () => {
  const replace = Vue.ref(false)
  let preloads = 0
  const Navigation = Vue.defineComponent({
    setup: () => () => (
      <>
        <Link
          to="/target"
          search={{}}
          preload="intent"
          preloadDelay={50}
          replace={replace.value}
        >
          target
        </Link>
        <Outlet />
      </>
    ),
  })
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({
    getParentRoute: () => root,
    path: '/source',
    component: () => <div>source content</div>,
  })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    beforeLoad: ({ preload }) => {
      if (preload) {
        preloads++
      }
    },
    component: () => <div>target content</div>,
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  render(<RouterProvider router={router} />)
  await screen.findByText('source content')
  const link = screen.getByRole('link', { name: 'target' })
  vi.useFakeTimers()
  try {
    await fireEvent.mouseEnter(link)
    replace.value = true
    await Vue.nextTick()
    expect(screen.getByRole('link', { name: 'target' })).toBe(link)
    await vi.advanceTimersByTimeAsync(50)
    expect(preloads).toBe(1)
  } finally {
    vi.useRealTimers()
  }
  const before = router.history.length
  await fireEvent.click(link)
  await screen.findByText('target content')
  expect(router.history.length).toBe(before)
})

test.each(['state-only', 'href-only', 'masked'] as const)(
  'a %s destination change preserves inactive style callbacks when source changes without changing activity',
  async (kind) => {
    let styleCalls = 0
    const inactiveProps = () => {
      styleCalls++
      return { class: 'inactive' }
    }
    const params = kind === 'masked' ? true : { id: 'fixed' }
    const search = kind === 'href-only' ? true : {}
    const mask = kind === 'masked' ? { to: '/masked', search: {} } : undefined
    const state = (previous: ParsedHistoryState) => ({
      ...previous,
      copied: true,
    })
    const Navigation = Vue.defineComponent({
      setup: () => () => (
        <>
          <Link
            to="/target/$id"
            params={params}
            search={search}
            mask={mask}
            state={state}
            inactiveProps={inactiveProps}
          >
            stable activity
          </Link>
          <Outlet />
        </>
      ),
    })
    const root = createRootRoute({
      validateSearch: (value: Record<string, unknown>) => value,
      component: Navigation,
    })
    const source = createRoute({
      getParentRoute: () => root,
      path: '/source/$id',
      component: () => <div>source content</div>,
    })
    const target = createRoute({
      getParentRoute: () => root,
      path: '/target/$id',
    })
    const masked = createRoute({ getParentRoute: () => root, path: '/masked' })
    const router = createRouter({
      routeTree: root.addChildren([source, target, masked]),
      history: createMemoryHistory({
        initialEntries: ['/source/first?visit=1'],
      }),
    })
    render(<RouterProvider router={router} />)
    await screen.findByText('source content')
    const link = screen.getByRole('link', { name: 'stable activity' })
    expect(link).not.toHaveAttribute('data-status', 'active')
    const initialCalls = styleCalls
    expect(initialCalls).toBeGreaterThan(0)
    await router.navigate({
      to: '/source/$id',
      params: { id: 'second' },
      search: { visit: 2 },
    })
    await Vue.nextTick()
    expect(screen.getByRole('link', { name: 'stable activity' })).toBe(link)
    expect(link).toHaveAttribute(
      'href',
      kind === 'masked'
        ? '/masked'
        : kind === 'href-only'
          ? '/target/fixed?visit=2'
          : '/target/fixed',
    )
    expect(link).not.toHaveAttribute('data-status', 'active')
    expect(styleCalls).toBe(initialCalls)
  },
)

test('unmounting an intent Link cancels its timer and a remount owns a fresh timer', async () => {
  const show = Vue.ref(true)
  let preloads = 0
  const Navigation = Vue.defineComponent({
    setup: () => () =>
      show.value ? (
        <Link to="/target" preload="intent" preloadDelay={50}>
          target
        </Link>
      ) : (
        <div>hidden</div>
      ),
  })
  const root = createRootRoute({ component: Navigation })
  const source = createRoute({ getParentRoute: () => root, path: '/source' })
  const target = createRoute({
    getParentRoute: () => root,
    path: '/target',
    beforeLoad: ({ preload }) => {
      if (preload) {
        preloads++
      }
    },
  })
  const router = createRouter({
    routeTree: root.addChildren([source, target]),
    history: createMemoryHistory({ initialEntries: ['/source'] }),
  })
  render(<RouterProvider router={router} />)
  const link = await screen.findByRole('link', { name: 'target' })
  vi.useFakeTimers()
  try {
    await fireEvent.mouseEnter(link)
    show.value = false
    await Vue.nextTick()
    await vi.advanceTimersByTimeAsync(50)
    expect(preloads).toBe(0)
    show.value = true
    await Vue.nextTick()
    const remounted = screen.getByRole('link', { name: 'target' })
    expect(remounted).not.toBe(link)
    await fireEvent.mouseEnter(remounted)
    await vi.advanceTimersByTimeAsync(50)
    expect(preloads).toBe(1)
  } finally {
    vi.useRealTimers()
  }
})
