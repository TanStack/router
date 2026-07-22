import {
  createRootRoute,
  createRoute,
  createRouter as createWebRouter,
} from '@tanstack/react-router'
import { describe, expect, test, vi } from 'vitest'
import { resolveNativeScriptNavigateOptions } from '../src/native-navigation'
import {
  assertNativeScriptRouter,
  createNativeScriptRouter,
  isNativeScriptRouter,
} from '../src/router'

vi.mock('@nativescript/core/abortcontroller', () => ({
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
}))
vi.mock('@nativescript/core/utils', () => ({
  openUrlAsync: vi.fn(),
}))

function createRouter(options?: {
  defaultStackBehavior?: 'push' | 'reuse'
  openExternalUrl?: (url: string) => boolean | Promise<boolean>
}) {
  const getId = vi.fn(
    ({ params, search }: { params: Record<string, string>; search: unknown }) =>
      `item:${params.itemId}:${(search as { tab?: string }).tab ?? 'main'}`,
  )
  const rootRoute = createRootRoute()
  const plainRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/plain',
  })
  const itemRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/items/$itemId',
    native: {
      getId,
      stackMatch: 'oldest',
    },
  })
  const router = createNativeScriptRouter({
    routeTree: rootRoute.addChildren([plainRoute, itemRoute]),
    native: {
      defaultStackBehavior: options?.defaultStackBehavior,
      openExternalUrl: options?.openExternalUrl,
    },
  })

  return { getId, router }
}

describe('resolveNativeScriptNavigateOptions', () => {
  test('identifies adapter routers and rejects web routers', () => {
    const rootRoute = createRootRoute()
    const nativeRouter = createNativeScriptRouter({ routeTree: rootRoute })
    const webRouter = createWebRouter({ routeTree: rootRoute })

    expect(isNativeScriptRouter(nativeRouter)).toBe(true)
    expect(isNativeScriptRouter(webRouter)).toBe(false)
    expect(() => assertNativeScriptRouter(nativeRouter)).not.toThrow()
    expect(() => assertNativeScriptRouter(webRouter)).toThrow(
      'NativeScriptRouterProvider requires a NativeScriptRouter',
    )
  })

  test('defaults to exact-location reuse', async () => {
    const { router } = createRouter()
    await router.load()

    const resolved = resolveNativeScriptNavigateOptions(router, {
      to: '/plain',
      search: { tab: 'one' },
      hash: 'heading',
    })

    expect(resolved).toMatchObject({
      stackBehavior: 'reuse',
      stackMatch: 'nearest',
      entryId: '/plain?tab=one#heading',
    })
  })

  test('uses route identity and match policy', async () => {
    const { getId, router } = createRouter()
    await router.load()

    const resolved = resolveNativeScriptNavigateOptions(router, {
      to: '/items/$itemId',
      params: { itemId: '42' },
      search: { tab: 'activity' },
    })

    expect(resolved.entryId).toBe('item:42:activity')
    expect(resolved.stackMatch).toBe('oldest')
    expect(getId).toHaveBeenCalledWith({
      pathname: '/items/42',
      href: '/items/42?tab=activity',
      params: { itemId: '42' },
      search: { tab: 'activity' },
    })
  })

  test('honors router and navigation overrides', async () => {
    const { router } = createRouter({ defaultStackBehavior: 'push' })
    await router.load()

    const routerDefault = resolveNativeScriptNavigateOptions(router, {
      to: '/plain',
    })
    const navigationOverride = resolveNativeScriptNavigateOptions(router, {
      to: '/plain',
      stackBehavior: 'reuse',
      stackMatch: 'oldest',
      entryId: 'explicit',
    })

    expect(routerDefault.stackBehavior).toBe('push')
    expect(navigationOverride).toMatchObject({
      stackBehavior: 'reuse',
      stackMatch: 'oldest',
      entryId: 'explicit',
    })
  })

  test('preserves explicit standard replace semantics', async () => {
    const { router } = createRouter({ defaultStackBehavior: 'reuse' })
    await router.load()

    expect(
      resolveNativeScriptNavigateOptions(router, {
        to: '/plain',
        replace: true,
      }).stackBehavior,
    ).toBe('replace')
    expect(
      resolveNativeScriptNavigateOptions(router, {
        to: '/plain',
        replace: false,
      }).stackBehavior,
    ).toBe('push')
    expect(
      resolveNativeScriptNavigateOptions(router, {
        to: '/plain',
        replace: true,
        stackBehavior: 'reuse',
      }).stackBehavior,
    ).toBe('reuse')
  })

  test('applies native identity to direct router.navigate calls', async () => {
    const rootRoute = createRootRoute()
    const plainRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/plain',
    })
    const itemRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
      native: {
        getId: ({ params }) => `item:${params.itemId}`,
      },
    })
    const router = createNativeScriptRouter({
      routeTree: rootRoute.addChildren([plainRoute, itemRoute]),
      native: { defaultStackBehavior: 'reuse' },
    })
    await router.load()

    await router.navigate({
      to: '/items/$itemId',
      params: { itemId: '42' },
      search: { tab: 'first' },
    })
    expect(router.history.location.state.__TSR_entryId).toBe('item:42')

    await router.navigate({ to: '/plain' })
    await router.navigate({
      to: '/items/$itemId',
      params: { itemId: '42' },
      search: { tab: 'second' },
    })

    expect(router.history.location.state.__TSR_index).toBe(1)
    expect(router.history.location.href).toBe('/items/42?tab=first')
  })

  test('opens absolute URLs through the NativeScript host', async () => {
    const openExternalUrl = vi.fn(() => Promise.resolve(true))
    const rootRoute = createRootRoute()
    const router = createNativeScriptRouter({
      routeTree: rootRoute,
      native: { openExternalUrl },
    })
    await router.load()

    await router.navigate({ href: 'https://example.com/account' })

    expect(openExternalUrl).toHaveBeenCalledWith('https://example.com/account')
    expect(router.history.location.pathname).toBe('/')
  })

  test('applies active blockers to external URLs', async () => {
    const openExternalUrl = vi.fn(() => Promise.resolve(true))
    const rootRoute = createRootRoute()
    const router = createNativeScriptRouter({
      routeTree: rootRoute,
      native: { openExternalUrl },
    })
    await router.load()
    const blockerFn = vi.fn(() => Promise.resolve(true))
    const unblock = router.history.block({ blockerFn })

    await router.navigate({ href: 'https://example.com/account' })
    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(blockerFn).toHaveBeenCalledWith({
      currentLocation: router.history.location,
      nextLocation: router.history.location,
      action: 'PUSH',
    })

    await router.navigate({
      href: 'https://example.com/account',
      ignoreBlocker: true,
    })
    expect(openExternalUrl).toHaveBeenCalledOnce()
    unblock()
  })

  test('blocks dangerous external protocols', async () => {
    const openExternalUrl = vi.fn(() => Promise.resolve(true))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rootRoute = createRootRoute()
    const router = createNativeScriptRouter({
      routeTree: rootRoute,
      native: { openExternalUrl },
    })
    await router.load()

    await router.navigate({ href: 'javascript:alert(1)' })

    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(
      'Blocked navigation to dangerous protocol: javascript:alert(1)',
    )
  })

  test('rejects when the host cannot open an external URL', async () => {
    const rootRoute = createRootRoute()
    const router = createNativeScriptRouter({
      routeTree: rootRoute,
      native: { openExternalUrl: () => false },
    })
    await router.load()

    await expect(
      router.navigate({ href: 'https://example.com/account' }),
    ).rejects.toThrow(
      'NativeScript could not open external URL: https://example.com/account',
    )
  })

  test('keeps shared reloadDocument links inside the native stack', async () => {
    const openExternalUrl = vi.fn(() => Promise.resolve(true))
    const rootRoute = createRootRoute()
    const plainRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/plain',
    })
    const router = createNativeScriptRouter({
      routeTree: rootRoute.addChildren([plainRoute]),
      native: { openExternalUrl },
    })
    await router.load()

    await router.navigate({ to: '/plain', reloadDocument: true })

    expect(openExternalUrl).not.toHaveBeenCalled()
    expect(router.history.location.pathname).toBe('/plain')
  })

  test('waits for asynchronous blockers before settling back navigation', async () => {
    const { router } = createRouter()
    await router.load()
    await router.navigate({ to: '/plain' })
    let decide!: (blocked: boolean) => void
    const unblock = router.history.block({
      blockerFn: () =>
        new Promise<boolean>((resolve) => {
          decide = resolve
        }),
    })

    const navigation = router.back()
    expect(router.history.location.pathname).toBe('/plain')

    decide(false)
    await navigation

    expect(router.history.location.pathname).toBe('/')
    expect(router.state.location.pathname).toBe('/')
    unblock()
  })

  test('resolves blocked navigation without loading the rejected location', async () => {
    const { router } = createRouter()
    await router.load()
    const unblock = router.history.block({
      blockerFn: () => Promise.resolve(true),
    })

    await router.navigate({ to: '/plain' })

    expect(router.history.location.pathname).toBe('/')
    expect(router.state.location.pathname).toBe('/')
    unblock()
  })
})
