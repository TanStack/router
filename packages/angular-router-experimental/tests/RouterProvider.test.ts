import * as Angular from '@angular/core'
import { render, waitFor } from '@testing-library/angular'
import { afterEach, expect, test, vi } from 'vitest'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetAllMocks()
})

test('RouterProvider merges router options context and input context/options', async () => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    context: {
      appName: 'router',
    },
  })

  await render(RouterProvider, {
    bindings: [
      Angular.inputBinding('router', () => router),
      Angular.inputBinding('context', () => ({ feature: 'angular' })),
      Angular.inputBinding('options', () => ({ defaultPreloadDelay: 123 })),
    ],
  })

  await waitFor(() => {
    expect(router.options.defaultPreloadDelay).toBe(123)
    expect(router.options.context).toMatchObject({
      appName: 'router',
      feature: 'angular',
    })
  })
})

test('RouterProvider reacts to context and options signal updates', async () => {
  const rootRoute = createRootRoute()
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  const contextSig = Angular.signal({ env: 'dev' })
  const optionsSig = Angular.signal({ defaultPreloadDelay: 10 })

  const rendered = await render(RouterProvider, {
    bindings: [
      Angular.inputBinding('router', () => router),
      Angular.inputBinding('context', () => contextSig()),
      Angular.inputBinding('options', () => optionsSig()),
    ],
  })

  await waitFor(() => {
    expect(router.options.defaultPreloadDelay).toBe(10)
    expect(router.options.context).toMatchObject({ env: 'dev' })
  })

  contextSig.set({ env: 'test' })
  optionsSig.set({ defaultPreloadDelay: 250 })
  rendered.fixture.detectChanges()

  await waitFor(() => {
    expect(router.options.defaultPreloadDelay).toBe(250)
    expect(router.options.context).toMatchObject({ env: 'test' })
  })
})
