import * as Angular from '@angular/core'
import { fireEvent, render, screen } from '@testing-library/angular'
import { beforeEach, describe, expect, test } from 'vitest'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectCanGoBack,
  injectLocation,
  injectRouter,
} from '../src'

beforeEach(() => {
  window.history.replaceState(null, 'root', '/')
})

describe('injectCanGoBack', () => {
  @Angular.Component({
    imports: [Link, Outlet],
    template: `
      <button (click)="goBack()">Back</button>
      <a [link]="{ to: '/' }">Home</a>
      <a [link]="{ to: '/about' }">About</a>
      <outlet />
    `,
  })
  class RootComponent {
    router = injectRouter()
    location = injectLocation()
    canGoBack = injectCanGoBack()

    goBack() {
      this.router.history.back()
    }
  }

  @Angular.Component({
    selector: 'can-go-back-index',
    template: '<h1>IndexTitle</h1>',
    standalone: true,
  })
  class IndexComponent {}

  @Angular.Component({
    selector: 'can-go-back-about',
    template: '<h1>AboutTitle</h1>',
    standalone: true,
  })
  class AboutComponent {}

  function setup({
    initialEntries = ['/'],
  }: {
    initialEntries?: Array<string>
  } = {}) {
    const rootRoute = createRootRoute({
      component: () => RootComponent,
    })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => IndexComponent,
    })
    const aboutRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/about',
      component: () => AboutComponent,
    })

    const router = createRouter({
      routeTree: rootRoute.addChildren([indexRoute, aboutRoute]),
      history: createMemoryHistory({ initialEntries }),
      defaultPendingMinMs: 0,
    })

    const result = render(RouterProvider, {
      bindings: [Angular.inputBinding('router', () => router)],
    })
    return { ...result, router }
  }

  test('when no location behind', async () => {
    const { router } = setup()

    const indexTitle = await screen.findByText('IndexTitle')
    expect(indexTitle).toBeTruthy()

    const aboutLink = await screen.findByText('About')
    fireEvent.click(aboutLink)

    const aboutTitle = await screen.findByText('AboutTitle')
    expect(aboutTitle).toBeTruthy()
  })

  test('when location behind', async () => {
    setup({
      initialEntries: ['/', '/about'],
    })

    const aboutTitle = await screen.findByText('AboutTitle')
    expect(aboutTitle).toBeTruthy()

    const backButton = await screen.findByText('Back')
    fireEvent.click(backButton)

    const indexTitle = await screen.findByText('IndexTitle')
    expect(indexTitle).toBeTruthy()
  })
})

