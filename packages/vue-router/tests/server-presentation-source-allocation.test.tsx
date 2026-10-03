import * as Vue from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createAtom, useSelector } from '@tanstack/vue-store'
import { cleanup, render, screen } from '@testing-library/vue'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  CatchBoundary,
  ClientOnly,
  ErrorComponent,
  HeadContent,
  Link,
  Outlet,
  RouterProvider,
  Scripts,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  useCanGoBack,
  useChildMatches,
  useLocation,
  useMatch,
  useMatchRoute,
  useMatches,
  useParentMatches,
  useRouterState,
} from '../src'
import { useHydrated } from '../src/ClientOnly'
import type * as VueStore from '@tanstack/vue-store'

const routerVueAllocations = vi.hoisted(
  () => [] as Array<{ api: string; caller: string }>,
)

vi.mock('vue', async (importOriginal) => {
  const original = await importOriginal<typeof Vue>()
  const tracked: Record<string, (...args: Array<any>) => any> = {}
  for (const api of [
    'ref',
    'shallowRef',
    'computed',
    'watch',
    'watchEffect',
  ] as const) {
    tracked[api] = (...args: Array<any>) => {
      // Count the direct consumer, excluding renderer/store internals and this
      // fixture's own reactive setup. The client control proves instrumentation.
      const caller = new Error().stack
        ?.split('\n')
        .slice(1)
        .find(
          (line) =>
            /:\d+:\d+/.test(line) &&
            !line.includes('server-presentation-source-allocation.test.tsx') &&
            !line.includes('/tinyspy/') &&
            !line.includes('/vitest/'),
        )
      if (caller?.includes('/packages/vue-router/src/')) {
        routerVueAllocations.push({ api, caller })
      }
      return (original[api] as (...values: Array<any>) => any)(...args)
    }
  }
  return { ...original, ...tracked }
})

vi.mock('@tanstack/vue-store', async (importOriginal) => {
  const original = await importOriginal<typeof VueStore>()
  return {
    ...original,
    createAtom: vi.fn(original.createAtom),
    useSelector: vi.fn(original.useSelector),
  }
})

beforeEach(() => {
  vi.mocked(createAtom).mockClear()
  vi.mocked(useSelector).mockClear()
  routerVueAllocations.length = 0
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  cleanup()
})

test.each(['production', 'development', 'test'] as const)(
  'server matches do not allocate reactive presentation locations in %s',
  async (environment) => {
    vi.stubEnv('NODE_ENV', environment)
    const root = createRootRoute({
      head: () => ({ meta: [{ title: 'Server source' }] }),
      component: () => Vue.h(Outlet),
    })
    const route = createRoute({
      getParentRoute: () => root,
      path: '/server/$id',
      errorComponent: ErrorComponent,
      notFoundComponent: () => Vue.h('div', 'not found'),
      component: Vue.defineComponent({
        setup() {
          const location = useLocation()
          const match = useMatch({ from: '/server/$id' })
          const state = useRouterState()
          const matches = useMatches()
          const parents = useParentMatches()
          const children = useChildMatches()
          const canGoBack = useCanGoBack()
          const matched = useMatchRoute()({
            to: '/server/$id',
            params: { id: 'first' },
          })
          for (const value of [
            location,
            match,
            state,
            matches,
            parents,
            children,
            canGoBack,
            matched,
          ]) {
            expect(Vue.isRef(value)).toBe(true)
          }
          expect(Vue.unref(location).pathname).toBe('/server/first')
          expect(Vue.unref(match).params.id).toBe('first')
          expect(Vue.unref(state).location).toBe(Vue.unref(location))
          expect(Vue.unref(matches)).toHaveLength(2)
          expect(Vue.unref(parents)).toHaveLength(1)
          expect(Vue.unref(children)).toHaveLength(0)
          expect(Vue.unref(canGoBack)).toBe(false)
          expect(Vue.unref(matched)).toEqual({ id: 'first' })
          return () =>
            Vue.h('div', [
              Vue.h(HeadContent),
              Vue.h(
                Link,
                { to: '/server/$id', params: true, search: true },
                () => 'server',
              ),
              Vue.h(Scripts),
              Vue.h(
                ClientOnly,
                { fallback: Vue.h('div', 'server client-only fallback') },
                () => Vue.h('div', 'client-only content'),
              ),
            ])
        },
      }),
    })
    const history = createMemoryHistory({
      initialEntries: ['/server/first?visit=3'],
    })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: true,
    })
    const initialLocation = router.state.location
    const locationAllocations = (location: typeof initialLocation) =>
      vi
        .mocked(createAtom)
        .mock.calls.filter(
          ([value]) => value === initialLocation || value === location,
        ).length
    // Server rendering reads the public store values directly, including
    // development/tests where conditional exports do not force server mode.
    const initialAllocations = locationAllocations(initialLocation)
    expect(initialAllocations).toBe(0)
    try {
      await router.load()
      const renderedLocation = router.state.location
      const html = await renderToString(
        Vue.createSSRApp(() => Vue.h(RouterProvider, { router })),
      )
      expect(html).toContain('href="/server/first?visit=3"')
      expect(html).toContain('<title>Server source</title>')
      expect(html).toContain('server client-only fallback')
      expect(html).not.toContain('client-only content')
      expect(locationAllocations(renderedLocation)).toBe(initialAllocations)
      expect(createAtom).not.toHaveBeenCalled()
      expect(useSelector).not.toHaveBeenCalled()
      expect(routerVueAllocations).toEqual([])
    } finally {
      history.destroy()
    }
  },
)

test('allocation instrumentation observes client router consumers', async () => {
  const root = createRootRoute({
    component: Outlet,
    errorComponent: ErrorComponent,
  })
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => Vue.h(Link, { to: '/' }, () => 'client instrumentation'),
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({ routeTree: root.addChildren([route]), history })
  try {
    render(Vue.h(RouterProvider, { router }))
    await screen.findByText('client instrumentation')
    const apis = new Set(routerVueAllocations.map(({ api }) => api))
    for (const api of [
      'ref',
      'shallowRef',
      'computed',
      'watch',
      'watchEffect',
    ]) {
      expect(apis.has(api), `missing client instrumentation for ${api}`).toBe(
        true,
      )
    }
  } finally {
    history.destroy()
  }
})

test.each(['pending', 'not-found'] as const)(
  'server %s fallback consumers do not create Vue reactivity',
  async (kind) => {
    const root = createRootRoute({ component: Outlet })
    const fallback = () =>
      Vue.h(Link, { to: '/fallback/$id', params: true }, () => `${kind} source`)
    const route = createRoute({
      getParentRoute: () => root,
      path: '/fallback/$id',
      ...(kind === 'pending'
        ? { ssr: false as const, pendingComponent: fallback }
        : { notFoundComponent: fallback }),
      loader: () => {
        if (kind === 'not-found') {
          throw notFound()
        }
      },
      component: () => Vue.h('div', 'should not render'),
    })
    const history = createMemoryHistory({ initialEntries: ['/fallback/first'] })
    const router = createRouter({
      routeTree: root.addChildren([route]),
      history,
      isServer: true,
    })
    try {
      await router.load()
      const html = await renderToString(
        Vue.createSSRApp(() => Vue.h(RouterProvider, { router })),
      )
      expect(html).toContain(`>${kind} source</a>`)
      expect(html).toContain('href="/fallback/first"')
      expect(html).not.toContain('should not render')
      expect(createAtom).not.toHaveBeenCalled()
      expect(useSelector).not.toHaveBeenCalled()
      expect(routerVueAllocations).toEqual([])
    } finally {
      history.destroy()
    }
  },
)

test('standalone server errors, hydration refs and ClientOnly avoid Vue reactivity without a provider', async () => {
  vi.stubGlobal('window', undefined)
  const Standalone = Vue.defineComponent({
    setup() {
      const hydrated = useHydrated()
      expect(Vue.isRef(hydrated)).toBe(true)
      expect(Vue.unref(hydrated)).toBe(false)
      return () =>
        Vue.h('div', [
          Vue.h(ErrorComponent, {
            error: new Error('standalone server error'),
          }),
          Vue.h(CatchBoundary, {
            getResetKey: () => 0,
            children: Vue.h('span', 'boundary child'),
          }),
          Vue.h(
            ClientOnly,
            { fallback: Vue.h('span', 'standalone fallback') },
            () => Vue.h('span', 'standalone client'),
          ),
        ])
    },
  })
  const html = await renderToString(Vue.createSSRApp(Standalone))
  expect(html).toContain('Something went wrong!')
  expect(html).toContain('boundary child')
  expect(html).toContain('standalone fallback')
  expect(html).not.toContain('standalone client')
  expect(routerVueAllocations).toEqual([])
})
