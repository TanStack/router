import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
  vi.useRealTimers()
})

function createTestRouter(initialHistory?: RouterHistory) {
  const history =
    initialHistory ?? createMemoryHistory({ initialEntries: ['/'] })

  const rootRoute = createRootRoute({})
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexComponent,
  })

  const heavyRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/heavy',
  }).lazy(() => import('./lazy/heavy').then((d) => d.default('/heavy')))

  const routeTree = rootRoute.addChildren([indexRoute, heavyRoute])

  const router = createRouter({ routeTree, history })

  return {
    router,
    routes: { indexRoute, heavyRoute },
  }
}

@Angular.Component({
  imports: [Link],
  template: `
    <div>
      <p>Index Route</p>
      <a [link]="{ to: '/heavy' }">Link to heavy</a>
    </div>
  `,
})
class IndexComponent {}

describe('preload: matched routes', { timeout: 20000 }, () => {
  it('should wait for lazy options to be streamed in before', async () => {
    const { router } = createTestRouter(
      createMemoryHistory({ initialEntries: ['/'] }),
    )

    await router.load()

    // Preload the route and navigate to it
    router.preloadRoute({ to: '/heavy' })
    await router.navigate({ to: '/heavy' })

    await router.invalidate()

    expect(router.state.location.pathname).toBe('/heavy')

    const lazyRoute = router.routesByPath['/heavy']

    expect(lazyRoute.options.component).toBeDefined()
  })

  it('should render the heavy/lazy component', async () => {
    const { router } = createTestRouter(createBrowserHistory())

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })

    const linkToHeavy = await screen.findByText('Link to heavy')
    expect(linkToHeavy).toBeTruthy()

    expect(router.state.location.pathname).toBe('/')
    expect(window.location.pathname).toBe('/')

    // click the link to navigate to the heavy route
    fireEvent.click(linkToHeavy)

    const heavyElement = await screen.findByText('I am sooo heavy')

    expect(heavyElement).toBeTruthy()

    expect(router.state.location.pathname).toBe('/heavy')
    expect(window.location.pathname).toBe('/heavy')

    const lazyRoute = router.routesByPath['/heavy']
    expect(lazyRoute.options.component).toBeDefined()
  })
})
