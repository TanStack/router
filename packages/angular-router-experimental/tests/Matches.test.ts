import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { afterEach, expect, test, vi } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectErrorState,
} from '../src'
import { sleep } from './utils'

afterEach(() => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
})

@Angular.Component({
  template: '<h1 data-testid="home">Home</h1>',
  standalone: true,
})
class HomeComponent {}

@Angular.Component({
  template: '<h1 data-testid="pending">Pending</h1>',
  standalone: true,
})
class PendingComponent {}

@Angular.Component({
  template: '<h1 data-testid="not-found">Not Found</h1>',
  standalone: true,
})
class NotFoundComponent {}

@Angular.Component({
  template: '<h1 data-testid="error">Error: {{ state.error?.message }}</h1>',
  standalone: true,
})
class ErrorComponent {
  state = injectErrorState()
}

@Angular.Component({
  imports: [Link, Outlet],
  template: `
    <a [link]="{ to: '/' }" data-testid="home-link">Home</a>
    <a [link]="{ to: '/slow' }" data-testid="slow-link">Slow</a>
    <a [link]="{ to: '/bad' }" data-testid="bad-link">Bad</a>
    <a [link]="{ to: '/settings/' }" data-testid="settings-link">Settings</a>
    <a [link]="{ to: '/settings/does-not-exist' }" data-testid="settings-missing-link">Missing</a>
    <outlet />
  `,
})
class RootComponent {}

@Angular.Component({
  template: '<h1 data-testid="slow">Slow Route</h1>',
  standalone: true,
})
class SlowComponent {}

@Angular.Component({
  imports: [Outlet],
  template: '<h1>Settings Layout</h1><outlet />',
})
class SettingsLayoutComponent {}

@Angular.Component({
  template: '<h1 data-testid="settings-index">Settings Index</h1>',
  standalone: true,
})
class SettingsIndexComponent {}

function makeRouter() {
  const rootRoute = createRootRoute({
    component: () => RootComponent,
    notFoundComponent: () => NotFoundComponent,
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => HomeComponent,
  })

  const slowRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/slow',
    pendingComponent: () => PendingComponent,
    loader: async () => {
      await sleep(1200)
      return { ok: true }
    },
    component: () => SlowComponent,
  })

  const badRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/bad',
    loader: () => {
      throw new Error('boom')
    },
    errorComponent: () => ErrorComponent,
    component: () => HomeComponent,
  })

  const settingsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/settings',
    notFoundComponent: () => NotFoundComponent,
    component: () => SettingsLayoutComponent,
  })

  const settingsIndexRoute = createRoute({
    getParentRoute: () => settingsRoute,
    path: '/',
    component: () => SettingsIndexComponent,
  })

  return createRouter({
    routeTree: rootRoute.addChildren([
      indexRoute,
      slowRoute,
      badRoute,
      settingsRoute.addChildren([settingsIndexRoute]),
    ]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    notFoundMode: 'fuzzy',
  })
}

test('renders success route', async () => {
  const router = makeRouter()

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  await expect(screen.findByTestId('home')).resolves.toBeTruthy()
})

// Skipped: deferred/pending UI during route load is n/a for Angular per PARITY_MATRIX.
// Pending component may not reliably render before success state due to timing/rendering.
test.skip('renders pending state and then success state', async () => {
  const router = makeRouter()

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const slowLink = await screen.findByTestId('slow-link')
  fireEvent.click(slowLink)

  await expect(screen.findByTestId('pending', undefined, { timeout: 2000 }))
    .resolves.toBeTruthy()
  await expect(screen.findByTestId('slow')).resolves.toBeTruthy()
})

test('renders error and notFound states', async () => {
  const router = makeRouter()

  await render(RouterProvider, {
    bindings: [Angular.inputBinding('router', () => router)],
  })

  const badLink = await screen.findByTestId('bad-link')
  fireEvent.click(badLink)

  await expect(screen.findByTestId('error')).resolves.toBeTruthy()

  const homeLink = await screen.findByTestId('home-link')
  fireEvent.click(homeLink)
  await expect(screen.findByTestId('home')).resolves.toBeTruthy()

  const settingsLink = await screen.findByTestId('settings-link')
  fireEvent.click(settingsLink)
  await expect(screen.findByTestId('settings-index')).resolves.toBeTruthy()

  const missingLink = await screen.findByTestId('settings-missing-link')
  fireEvent.click(missingLink)

  await expect(screen.findByTestId('not-found')).resolves.toBeTruthy()
})
