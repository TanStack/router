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
class RootComponent { }

@Angular.Component({
  template:
    '<span data-testid="root-not-found">Root Not Found Component</span>',
  standalone: true,
})
class RootNotFoundComponent { }

@Angular.Component({
  template: '<div data-testid="index-component"><h2>Index Page</h2></div>',
  standalone: true,
})
class IndexComponent { }

@Angular.Component({
  imports: [Outlet],
  template: `
    <div>
      <p>Settings Page Layout</p>
      <outlet />
    </div>
  `,
})
class SettingsLayoutComponent { }

@Angular.Component({
  template:
    '<span data-testid="settings-not-found">Settings Not Found Component</span>',
  standalone: true,
})
class SettingsNotFoundComponent { }

@Angular.Component({
  template: '<div data-testid="settings-index-component">Settings Page</div>',
  standalone: true,
})
class SettingsIndexComponent { }

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
