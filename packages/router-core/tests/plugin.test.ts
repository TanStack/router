import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'
import type { RouterPlugin } from '../src'

describe('plugin system', () => {
  function createRouteTree() {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    return rootRoute.addChildren([indexRoute])
  }

  describe('setup()', () => {
    it('calls plugin setup with the router instance', () => {
      const setupFn = vi.fn()
      const plugin: RouterPlugin<{ foo: string }> = {
        '~types': null as any,
        setup: setupFn,
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [plugin],
      } as any)

      expect(setupFn).toHaveBeenCalledTimes(1)
      expect(setupFn).toHaveBeenCalledWith(router)
    })

    it('calls multiple plugins in order', () => {
      const callOrder: Array<string> = []

      const pluginA: RouterPlugin<{ a: string }> = {
        '~types': null as any,
        setup: () => callOrder.push('a'),
      }
      const pluginB: RouterPlugin<{ b: number }> = {
        '~types': null as any,
        setup: () => callOrder.push('b'),
      }
      const pluginC: RouterPlugin<{ c: boolean }> = {
        '~types': null as any,
        setup: () => callOrder.push('c'),
      }

      const routeTree = createRouteTree()
      new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [pluginA, pluginB, pluginC],
      } as any)

      expect(callOrder).toEqual(['a', 'b', 'c'])
    })

    it('does not error when no plugins are provided', () => {
      const routeTree = createRouteTree()
      expect(
        () =>
          new RouterCore({
            routeTree,
            history: createMemoryHistory(),
          }),
      ).not.toThrow()
    })

    it('does not error when plugins array is empty', () => {
      const routeTree = createRouteTree()
      expect(
        () =>
          new RouterCore({
            routeTree,
            history: createMemoryHistory(),
            plugins: [],
          } as any),
      ).not.toThrow()
    })
  })

  describe('context merging', () => {
    it('plugin can merge values into router.options.context', () => {
      const plugin: RouterPlugin<{ queryClient: string }> = {
        '~types': null as any,
        setup: (router) => {
          router.options.context = {
            ...router.options.context,
            queryClient: 'test-client',
          }
        },
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [plugin],
      } as any)

      expect((router.options.context as any).queryClient).toBe('test-client')
    })

    it('multiple plugins can each merge different context values', () => {
      const pluginA: RouterPlugin<{ serviceA: string }> = {
        '~types': null as any,
        setup: (router) => {
          router.options.context = {
            ...router.options.context,
            serviceA: 'value-a',
          }
        },
      }
      const pluginB: RouterPlugin<{ serviceB: number }> = {
        '~types': null as any,
        setup: (router) => {
          router.options.context = {
            ...router.options.context,
            serviceB: 42,
          }
        },
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [pluginA, pluginB],
      } as any)

      const ctx = router.options.context as any
      expect(ctx.serviceA).toBe('value-a')
      expect(ctx.serviceB).toBe(42)
    })

    it('user-provided context is preserved alongside plugin context', () => {
      const plugin: RouterPlugin<{ fromPlugin: string }> = {
        '~types': null as any,
        setup: (router) => {
          router.options.context = {
            ...router.options.context,
            fromPlugin: 'plugin-value',
          }
        },
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        context: { fromUser: 'user-value' },
        plugins: [plugin],
      } as any)

      const ctx = router.options.context as any
      expect(ctx.fromUser).toBe('user-value')
      expect(ctx.fromPlugin).toBe('plugin-value')
    })
  })

  describe('dehydrate/hydrate hooking', () => {
    it('plugin can hook into dehydrate by chaining', () => {
      const plugin: RouterPlugin<Record<string, unknown>> = {
        '~types': null as any,
        setup: (router) => {
          const originalDehydrate = router.options.dehydrate
          router.options.dehydrate = () => {
            const base = originalDehydrate?.() ?? {}
            return { ...base, pluginData: 'dehydrated' }
          }
        },
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [plugin],
      } as any)

      const result = router.options.dehydrate?.()
      expect(result).toEqual({ pluginData: 'dehydrated' })
    })

    it('plugin can hook into hydrate by chaining', () => {
      const hydrateSpy = vi.fn()
      const plugin: RouterPlugin<Record<string, unknown>> = {
        '~types': null as any,
        setup: (router) => {
          const originalHydrate = router.options.hydrate
          router.options.hydrate = (data: any) => {
            originalHydrate?.(data)
            hydrateSpy(data)
          }
        },
      }

      const routeTree = createRouteTree()
      const router = new RouterCore({
        routeTree,
        history: createMemoryHistory(),
        plugins: [plugin],
      } as any)

      router.options.hydrate?.({ test: true } as any)
      expect(hydrateSpy).toHaveBeenCalledWith({ test: true })
    })
  })
})
