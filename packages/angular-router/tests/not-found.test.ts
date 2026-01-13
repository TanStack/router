import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  notFound,
  injectErrorState,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  window.history.replaceState(null, 'root', '/')
  vi.resetAllMocks()
})

@Angular.Component({
  imports: [Link, Outlet],
  template: `
    <div data-testid="root-component">
      <h1>Root Component</h1>
      <div>
        <a [link]="{ to: '/settings/' }" data-testid="settings-link">link to settings</a>
        <a [link]="{ to: '/settings/does-not-exist' }" data-testid="non-existing-link">link to non-existing route</a>
      </div>
      <outlet />
    </div>
  `,
})
class RootComponent {}

@Angular.Component({
  template:
    '<span data-testid="root-not-found">Root Not Found Component</span>',
  standalone: true,
})
class RootNotFoundComponent {}

@Angular.Component({
  template: '<div data-testid="index-component"><h2>Index Page</h2></div>',
  standalone: true,
})
class IndexComponent {}

@Angular.Component({
  imports: [Outlet],
  template: `
    <div>
      <p>Settings Page Layout</p>
      <outlet />
    </div>
  `,
})
class SettingsLayoutComponent {}

@Angular.Component({
  template:
    '<span data-testid="settings-not-found">Settings Not Found Component</span>',
  standalone: true,
})
class SettingsNotFoundComponent {}

@Angular.Component({
  template: '<div data-testid="settings-index-component">Settings Page</div>',
  standalone: true,
})
class SettingsIndexComponent {}

test.each([
  {
    notFoundMode: 'fuzzy' as const,
    expectedNotFoundComponent: 'settings-not-found',
  },
  {
    notFoundMode: 'root' as const,
    expectedNotFoundComponent: 'root-not-found',
  },
])(
  'correct notFoundComponent is rendered for mode=%s',
  async ({ notFoundMode, expectedNotFoundComponent }) => {
    const rootRoute = createRootRoute({
      component: () => RootComponent,
      notFoundComponent: () => RootNotFoundComponent,
    })

    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })

    const settingsRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/settings',
      notFoundComponent: () => SettingsNotFoundComponent,
      component: () => SettingsLayoutComponent,
    })

    const settingsIndexRoute = createRoute({
      getParentRoute: () => settingsRoute,
      path: '/',
      component: () => SettingsIndexComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([
        indexRoute,
        settingsRoute.addChildren([settingsIndexRoute]),
      ]),
      history,
      notFoundMode,
      defaultPendingMinMs: 0,
    })

    await render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })
    await router.load()
    await screen.findByTestId('root-component')

    const settingsLink = screen.getByTestId('settings-link')
    settingsLink.click()

    const settingsIndexComponent = await screen.findByTestId(
      'settings-index-component',
    )
    expect(settingsIndexComponent).toBeTruthy()

    const nonExistingLink = screen.getByTestId('non-existing-link')
    nonExistingLink.click()

    const notFoundComponent = await screen.findByTestId(
      expectedNotFoundComponent,
      undefined,
      { timeout: 1000 },
    )
    expect(notFoundComponent).toBeTruthy()
  },
)

test('defaultNotFoundComponent and notFoundComponent receives data props via spread operator', async () => {
  const isCustomData = (data: unknown): data is typeof customData => {
    return 'message' in (data as typeof customData)
  }

  const customData = {
    message: 'Custom not found message',
  }

  @Angular.Component({
    template: `
      <div data-testid="default-not-found-with-props">
        <span data-testid="message">
          @if (hasMessage()) {
            <span>{{ message() }}</span>
          }
        </span>
      </div>
    `,
    standalone: true,
  })
  class DefaultNotFoundComponentWithProps {
    errorState = injectErrorState()
    data = Angular.computed(() => (this.errorState.error as any)?.data)
    message = Angular.computed(() => {
      const data = this.data()
      return isCustomData(data) ? data.message : ''
    })
    hasMessage = Angular.computed(() => {
      const data = this.data()
      return isCustomData(data)
    })
  }

  @Angular.Component({
    imports: [Link, Outlet],
    template: `
      <div data-testid="root-component">
        <h1>Root Component</h1>

        <div>
          <a [link]="{ to: '/default-not-found-route' }" data-testid="default-not-found-route-link">link to default not found route</a>
          <a [link]="{ to: '/not-found-route' }" data-testid="not-found-route-link">link to not found route</a>
        </div>
        <outlet />
      </div>
    `,
  })
  class RootWithLinksComponent {}

  @Angular.Component({
    template: '<div data-testid="index-component"><h2>Index Page</h2></div>',
    standalone: true,
  })
  class IndexComponent2 {}

  @Angular.Component({
    template:
      '<div data-testid="default-not-found-route-component">Should not render</div>',
    standalone: true,
  })
  class DefaultNotFoundRouteComponent {}

  @Angular.Component({
    template: `
      <div data-testid="not-found-with-props">
        <span data-testid="message">
          @if (hasMessage()) {
            <span>{{ message() }}</span>
          }
        </span>
      </div>
    `,
    standalone: true,
  })
  class NotFoundWithPropsComponent {
    errorState = injectErrorState()
    data = Angular.computed(() => (this.errorState.error as any)?.data)
    message = Angular.computed(() => {
      const data = this.data()
      return isCustomData(data) ? data.message : ''
    })
    hasMessage = Angular.computed(() => {
      const data = this.data()
      return isCustomData(data)
    })
  }

  @Angular.Component({
    template:
      '<div data-testid="not-found-route-component">Should not render</div>',
    standalone: true,
  })
  class NotFoundRouteComponent {}

  const rootRoute = createRootRoute({
    component: () => RootWithLinksComponent,
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => IndexComponent2,
  })

  const defaultNotFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/default-not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => DefaultNotFoundRouteComponent,
  })

  const notFoundRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/not-found-route',
    loader: () => {
      throw notFound({ data: customData })
    },
    component: () => NotFoundRouteComponent,
    notFoundComponent: () => NotFoundWithPropsComponent,
  })

  const router = createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      defaultNotFoundRoute,
      notFoundRoute,
    ]),
    history,
    defaultNotFoundComponent: () => DefaultNotFoundComponentWithProps,
    defaultPendingMinMs: 0,
  })

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })
  await router.load()
  await screen.findByTestId('root-component')

  const defaultNotFoundRouteLink = screen.getByTestId(
    'default-not-found-route-link',
  )
  fireEvent.click(defaultNotFoundRouteLink)

  const defaultNotFoundComponent = await screen.findByTestId(
    'default-not-found-with-props',
    undefined,
    { timeout: 1000 },
  )
  expect(defaultNotFoundComponent).toBeTruthy()

  const defaultNotFoundComponentMessage = await screen.findByTestId('message')
  expect(defaultNotFoundComponentMessage.textContent).toContain(
    customData.message,
  )

  const notFoundRouteLink = screen.getByTestId('not-found-route-link')
  fireEvent.click(notFoundRouteLink)

  const notFoundComponent = await screen.findByTestId(
    'not-found-with-props',
    undefined,
    { timeout: 1000 },
  )
  expect(notFoundComponent).toBeTruthy()

  const errorMessageComponent = await screen.findByTestId('message')
  expect(errorMessageComponent.textContent).toContain(customData.message)
})
