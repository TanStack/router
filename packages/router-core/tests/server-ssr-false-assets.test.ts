import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

/**
 * `ssr: false` makes a route client-only. Its beforeLoad, loader, component,
 * and route assets must all stay out of the server response. Descendants
 * inherit that restriction even if they request `ssr: true` themselves.
 */
describe('server assets for ssr:false routes', () => {
  test('does not execute or publish assets for the client-only branch', async () => {
    const parentHead = vi.fn(() => ({
      meta: [{ title: 'client-only parent' }],
    }))
    const parentScripts = vi.fn(() => [
      {
        children: 'window.parentAssetRan = true',
      },
    ])
    const parentHeaders = vi.fn(() => ({
      'x-client-only-parent': 'unexpected',
    }))
    const childHead = vi.fn(() => ({
      meta: [{ title: 'client-only child' }],
    }))
    const childScripts = vi.fn(() => [
      {
        children: 'window.childAssetRan = true',
      },
    ])
    const childHeaders = vi.fn(() => ({
      'x-client-only-child': 'unexpected',
    }))

    const rootRoute = new BaseRootRoute({})
    const clientOnlyRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/client-only',
      ssr: false,
      head: parentHead,
      scripts: parentScripts,
      headers: parentHeaders,
    })
    const childRoute = new BaseRoute({
      getParentRoute: () => clientOnlyRoute,
      path: '/child',
      // A child cannot relax its parent's client-only restriction.
      ssr: true,
      head: childHead,
      scripts: childScripts,
      headers: childHeaders,
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        clientOnlyRoute.addChildren([childRoute]),
      ]),
      history: createMemoryHistory({
        initialEntries: ['/client-only/child'],
      }),
      isServer: true,
    })

    await router.load()

    const parentMatch = router.state.matches.find(
      (match) => match.routeId === clientOnlyRoute.id,
    )
    const childMatch = router.state.matches.find(
      (match) => match.routeId === childRoute.id,
    )

    expect({
      calls: {
        parentHead: parentHead.mock.calls.length,
        parentScripts: parentScripts.mock.calls.length,
        parentHeaders: parentHeaders.mock.calls.length,
        childHead: childHead.mock.calls.length,
        childScripts: childScripts.mock.calls.length,
        childHeaders: childHeaders.mock.calls.length,
      },
      matches: [parentMatch, childMatch].map((match) => ({
        ssr: match?.ssr,
        meta: match?.meta,
        scripts: match?.scripts,
        headers: match?.headers,
      })),
    }).toEqual({
      calls: {
        parentHead: 0,
        parentScripts: 0,
        parentHeaders: 0,
        childHead: 0,
        childScripts: 0,
        childHeaders: 0,
      },
      matches: [
        {
          ssr: false,
          meta: undefined,
          scripts: undefined,
          headers: undefined,
        },
        {
          ssr: false,
          meta: undefined,
          scripts: undefined,
          headers: undefined,
        },
      ],
    })
  })
})
