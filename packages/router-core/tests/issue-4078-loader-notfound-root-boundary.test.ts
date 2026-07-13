import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, notFound, rootRouteId } from '../src'
import { createTestRouter } from './routerTestUtils'

// https://github.com/TanStack/router/issues/4078
// https://github.com/TanStack/router/issues/2255
// Throwing an untargeted notFound() in a child loader used to always render the
// defaultNotFoundComponent, even when __root__ defined a notFoundComponent
// (#4078). #2255 is the same asymmetry: a path-mismatch notFound renders the
// root component + notFoundComponent, but a loader-thrown notFound did not.
//
// The lane-model getNotFoundBoundaryIndex walks up from the throwing route to
// the nearest route with a notFoundComponent; for an untargeted notFound with
// no boundary below root that is __root__ itself. When the boundary is the root
// route the root match commits `status: 'success'` with `globalNotFound: true`,
// so the root's own notFoundComponent renders (not the default).
describe('issue #4078 / #2255 - loader notFound resolves to the root boundary', () => {
  const setup = (initialEntries: Array<string>) => {
    const rootRoute = new BaseRootRoute({
      component: () => 'Root',
      notFoundComponent: () => 'Root not found',
    })
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
    })
    const aboutRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      loader: () => {
        throw notFound()
      },
      component: () => 'About',
    })

    return createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries }),
    })
  }

  it('navigating to a route whose loader throws notFound() selects the root boundary', async () => {
    const router = setup(['/'])
    await router.load()

    await router.navigate({ to: '/about' })
    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    // Root boundary selected: root renders its own notFoundComponent, not the
    // default one.
    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.globalNotFound).toBe(true)
  })

  it('initial load of that route selects the root boundary too (#2255 asymmetry)', async () => {
    const router = setup(['/about'])
    await router.load()

    const rootMatch = router.state.matches.find(
      (match) => match.routeId === rootRouteId,
    )
    expect(rootMatch?.status).toBe('success')
    expect(rootMatch?.globalNotFound).toBe(true)
  })
})
