import { MutationObserver, QueryClient } from '@tanstack/query-core'
import {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  redirect,
} from '@tanstack/router-core'
import { expect, test, vi } from 'vitest'
import { setupCoreRouterSsrQueryIntegration } from '../src'

test.each(['query', 'mutation'] as const)(
  '%s redirects keep their captured source when a state updater navigates',
  async (kind) => {
    window.history.replaceState({}, '', '/')
    const root = new BaseRootRoute({
      validateSearch: (search: Record<string, unknown>) => ({
        page: Number(search.page ?? 0),
      }),
    })
    const posts = new BaseRoute({
      getParentRoute: () => root,
      path: '/posts/$id',
    })
    const router = new RouterCore(
      { routeTree: root.addChildren([posts]), isServer: false },
      () => ({
        createMutableStore: createNonReactiveMutableStore,
        createReadonlyStore: createNonReactiveReadonlyStore,
        batch: (fn) => fn(),
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    setupCoreRouterSsrQueryIntegration({ router, queryClient })
    try {
      await router.navigate({
        to: '/posts/one',
        search: { page: 2 },
        hash: 'one',
        state: () => ({ querySource: 'one' }),
      })
      expect(router.state.location.state).toMatchObject({ querySource: 'one' })
      let navigated = false
      const error = redirect({
        to: '.',
        search: true,
        hash: true,
        state: (state) => {
          if (!navigated) {
            navigated = true
            void router.navigate({
              to: '/posts/two',
              search: { page: 9 },
              hash: 'two',
              state: () => ({ querySource: 'two' }),
            })
          }
          return {
            querySource: `${(state as { querySource?: string }).querySource}-copied`,
          }
        },
      })
      const fail = async () => {
        throw error
      }
      const result =
        kind === 'query'
          ? queryClient.fetchQuery({ queryKey: ['redirect'], queryFn: fail })
          : new MutationObserver(queryClient, { mutationFn: fail }).mutate()
      await expect(result).rejects.toBe(error)
      await vi.waitFor(() => {
        expect(router.state.location.href).toBe('/posts/one?page=2#one')
        expect(router.state.location.state).toMatchObject({
          querySource: 'one-copied',
        })
      })
    } finally {
      queryClient.clear()
      router.history.destroy()
      window.history.replaceState({}, '', '/')
    }
  },
)
