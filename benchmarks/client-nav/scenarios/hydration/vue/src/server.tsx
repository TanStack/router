import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import {
  createRequestHandler,
  renderRouterToStream,
} from '@tanstack/vue-router/ssr/server'
import { isServer } from '@tanstack/router-core/isServer'
import { createDiagnostics, serverUrl } from '../fixture'
import { createFixtureRouter } from './app'

export async function renderFixture() {
  if ((isServer as boolean | undefined) !== true) {
    throw new Error('Fixture generation requires the production server build')
  }
  const diagnostics = createDiagnostics()
  const response = await createRequestHandler({
    createRouter: () => createFixtureRouter(true, diagnostics),
    request: new Request(`http://localhost${serverUrl}`),
  })(async ({ request, router, responseHeaders }) =>
    renderRouterToStream({
      request,
      router,
      responseHeaders,
      // Vue hydrates an element container. Router's stream transform injects
      // the real bootstrap after that container, outside the hydrated subtree.
      App: Vue.defineComponent({
        inheritAttrs: false,
        setup: () => () => (
          <html lang="en">
            <head>
              <meta charset="utf-8" />
              <title>Hydration benchmark</title>
            </head>
            <body>
              <div id="__app">
                <RouterProvider router={router} />
              </div>
            </body>
          </html>
        ),
      }),
    }),
  )
  const html = await response.text()
  if (
    response.status !== 200 ||
    diagnostics.beforeLoads !== 3 ||
    diagnostics.loaders !== 2
  ) {
    throw new Error(
      'SSR fixture did not execute its beforeLoad and loader functions',
    )
  }
  return html
}
