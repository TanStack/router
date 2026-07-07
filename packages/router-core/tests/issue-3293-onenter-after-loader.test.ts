import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/3293
// onEnter used to fire before / in parallel with the route's loader, so the
// documented "onEnter runs once the route is loaded" contract was violated.
// The lane model runs onLeave/onStay/onEnter in the final commit, strictly
// after loadClientMatches, so onEnter always observes a settled loader.
describe('issue #3293 - onEnter runs after the loader settles', () => {
  const setup = (order: Array<string>, initialEntries: Array<string>) => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: async () => {
        order.push('loader:start')
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push('loader:end')
      },
      onEnter: () => {
        order.push('onEnter')
      },
    })

    return createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries }),
    })
  }

  it('initial load: onEnter fires after the loader end', async () => {
    const order: Array<string> = []
    const router = setup(order, ['/about'])

    await router.load()

    expect(order).toEqual(['loader:start', 'loader:end', 'onEnter'])
  })

  it('navigation: onEnter fires after the loader end', async () => {
    const order: Array<string> = []
    const router = setup(order, ['/'])

    await router.load()
    await router.navigate({ to: '/about' })

    expect(order).toEqual(['loader:start', 'loader:end', 'onEnter'])
  })
})
