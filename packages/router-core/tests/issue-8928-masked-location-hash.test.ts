import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

function setup() {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
  })
  const chatRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/chats/$chatId',
  })
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute, chatRoute]),
    history,
  })
  return { router, history }
}

// https://github.com/TanStack/router/issues/8928
describe('masked navigation keeps the hash of the real location', () => {
  test('the hash survives repeated masked navigations', async () => {
    const { router, history } = setup()
    await router.load()

    let hash = 'anchor'
    for (let i = 0; i < 3; i++) {
      await router.navigate({
        to: '/',
        hash,
        mask: { to: '/chats/$chatId', params: { chatId: 'c1' }, hash },
      })
      hash = router.parseLocation(history.location).hash
      expect(hash).toBe('anchor')
    }

    expect(router.state.location).toMatchObject({
      pathname: '/',
      hash: 'anchor',
      href: '/#anchor',
    })
    expect(router.state.location.maskedLocation).toMatchObject({
      pathname: '/chats/c1',
      hash: 'anchor',
    })
    expect(history.location.href).toBe('/chats/c1#anchor')
  })

  test('a masked navigation without a hash stays without one', async () => {
    const { router, history } = setup()
    await router.load()
    // Leave `/` first, so the masked navigation below is not a same-location no-op
    await router.navigate({ to: '/chats/$chatId', params: { chatId: 'c0' } })

    await router.navigate({
      to: '/',
      mask: { to: '/chats/$chatId', params: { chatId: 'c1' } },
    })

    expect(history.location.href).toBe('/chats/c1')
    expect(history.location.state.__tempLocation).toBeDefined()
    expect(router.parseLocation(history.location)).toMatchObject({
      pathname: '/',
      hash: '',
      href: '/',
    })
  })
})
