import * as Angular from '@angular/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/angular'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  Link,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  injectErrorState,
} from '../src'
import type { RouterHistory } from '@tanstack/history'

@Angular.Component({
  selector: 'error-component-host',
  template: '<div>Error: {{ errorState.error.message }}</div>',
  standalone: true,
})
class MyErrorComponent {
  errorState = injectErrorState()
}

const ASYNC_THROW_DELAY_MS = 50
const ERROR_RENDER_TIMEOUT_MS = 2500
const SHOULD_NOT_RENDER_TIMEOUT_MS = 500

async function asyncToThrowFn() {
  await new Promise((resolve) => setTimeout(resolve, ASYNC_THROW_DELAY_MS))
  throw new Error('error thrown')
}

function throwFn() {
  throw new Error('error thrown')
}

let history: RouterHistory

beforeEach(() => {
  history = createBrowserHistory()
  expect(window.location.pathname).toBe('/')
})

afterEach(() => {
  history.destroy()
  vi.resetAllMocks()
  window.history.replaceState(null, 'root', '/')
})

@Angular.Component({
  selector: 'error-home',
  imports: [Link],
  template: `
    <div>
      <a [link]="{ to: '/about' }">link to about</a>
    </div>
  `,
  standalone: true,
})
class HomeComponent { }

@Angular.Component({
  selector: 'error-about',
  template: '<div>About route content</div>',
  standalone: true,
})
class AboutComponent { }

@Angular.Component({
  selector: 'error-index',
  template: '<div>Index route content</div>',
  standalone: true,
})
class IndexComponent { }

describe.each([{ preload: false }, { preload: 'intent' }] as const)(
  'errorComponent is rendered when the preload=$preload',
  (options) => {
    describe.each([true, false])('with async=%s', (isAsync) => {
      const throwableFn = isAsync ? asyncToThrowFn : throwFn

      const callers = [
        { caller: 'beforeLoad', testFn: throwableFn },
        { caller: 'loader', testFn: throwableFn },
      ]

      test.each(callers)(
        'an Error is thrown on navigate in the route $caller function',
        async ({ caller, testFn }) => {
          const rootRoute = createRootRoute()
          const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/',
            component: () => HomeComponent,
          })
          const aboutRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/about',
            beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
            loader: caller === 'loader' ? testFn : undefined,
            component: () => AboutComponent,
            errorComponent: () => MyErrorComponent,
          })

          const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

          const router = createRouter({
            routeTree,
            defaultPreload: options.preload,
            history,
            defaultPendingMinMs: 0,
          })

          await render(RouterProvider, {
            bindings: [Angular.inputBinding('router', () => router)],
          })

          const linkToAbout = await screen.findByRole('link', {
            name: 'link to about',
          })

          expect(linkToAbout).toBeTruthy()
          fireEvent.mouseOver(linkToAbout)
          fireEvent.focus(linkToAbout)
          fireEvent.click(linkToAbout)

          const errorComponent = await screen.findByText(
            `Error: error thrown`,
            undefined,
            { timeout: ERROR_RENDER_TIMEOUT_MS },
          )
          await waitFor(
            () => {
              expect(screen.queryByText('About route content')).toBeNull()
            },
            { timeout: SHOULD_NOT_RENDER_TIMEOUT_MS },
          )
          expect(errorComponent).toBeTruthy()
        },
      )

      test.each(callers)(
        'an Error is thrown on first load in the route $caller function',
        async ({ caller, testFn }) => {
          const rootRoute = createRootRoute()
          const indexRoute = createRoute({
            getParentRoute: () => rootRoute,
            path: '/',
            beforeLoad: caller === 'beforeLoad' ? testFn : undefined,
            loader: caller === 'loader' ? testFn : undefined,
            component: () => IndexComponent,
            errorComponent: () => MyErrorComponent,
          })

          const routeTree = rootRoute.addChildren([indexRoute])

          const router = createRouter({
            routeTree,
            defaultPreload: options.preload,
            history,
            defaultPendingMinMs: 0,
          })

          await render(RouterProvider, {
            bindings: [Angular.inputBinding('router', () => router)],
          })

          const errorComponent = await screen.findByText(
            `Error: error thrown`,
            undefined,
            { timeout: ERROR_RENDER_TIMEOUT_MS },
          )
          await waitFor(
            () => {
              expect(screen.queryByText('Index route content')).toBeNull()
            },
            { timeout: SHOULD_NOT_RENDER_TIMEOUT_MS },
          )
          expect(errorComponent).toBeTruthy()
        },
      )
    })
  },
)
