/**
 * Route HMR where two routers hold routes of the same id (SPEC J3.3):
 *
 * - two routers of one route tree (a second router created last, mounted
 *   or not; React StrictMode calling a state initializer that creates the
 *   router twice): every router shows a route file's edit;
 * - two route trees of one app, each compiled by a router plugin instance of
 *   its own (TanStack/router#7174), both with a route `/`: an edit of one
 *   tree's file shows in its router, and the other tree's route keeps its
 *   own code.
 *
 * Each in the document the page loaded.
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import {
  emptyRoute,
  lazyFile,
  loaderRoute,
  twoTrees,
  widgetTree,
} from './route-hmr-two-routers-cases'
import type { TestContext } from 'vitest'

const timeout = 90_000

const sharedMains = {
  'a second router created last, never mounted': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
;(window as any).__SECOND__ = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  'a second router created last, mounted': `import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
const second = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
const element = document.createElement('div')
element.id = 'widget'
document.body.append(element)
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
createRoot(element).render(<RouterProvider router={second} />)
`,
  // (React calls a state initializer twice in StrictMode)
  'StrictMode, the router created in a state initializer': `import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
function App() {
  const [router] = useState(() => createRouter({ routeTree }))
  return <RouterProvider router={router} />
}
createRoot(document.getElementById('app')!).render(<StrictMode><App /></StrictMode>)
`,
}

describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s react: two routers of one route tree',
  (bundler) => {
    it.for(Object.keys(sharedMains) as Array<keyof typeof sharedMains>)(
      'a loader edit shows in every router of the tree (%s)',
      { timeout },
      async (name, { expect, onTestFinished }: TestContext) => {
        const mounted = name === 'a second router created last, mounted'
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'main.tsx': sharedMains[name],
            'routes/index.tsx': loaderRoute('react', 'shared data v1'),
          },
          ready: 'shared data v1',
        })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': loaderRoute('react', `shared data v${n}`) },
            `shared data v${n}`,
          )
          expect({
            app: await app.page.text('#app'),
            widget: mounted ? await app.page.text('#widget') : undefined,
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `shared data v${n}`,
            widget: mounted ? `shared data v${n}` : undefined,
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)

const root = (target: string) =>
  `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`

describe.concurrent.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  // (the split chunk and kept-reader reports of webpack-style hosts)
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
] as const)(
  '$bundler $target: two route trees, each compiled by a router plugin of its own',
  ({ bundler, target }) => {
    it(
      "an edit of the app tree's route `/` shows in the app's router; the other tree's `/` keeps its code",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          onTestFinished,
          moreRouteTrees: [widgetTree],
          files: {
            'main.tsx': twoTrees(target),
            'routes/index.tsx': loaderRoute(target, 'app v1'),
            'widget-routes/__root.tsx': root(target),
            'widget-routes/index.tsx': loaderRoute(target, 'widget', 'Widget'),
          },
          ready: 'app v1',
        })
        await app.page.waitForText('widget', { selector: '#widget' })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': loaderRoute(target, `app v${n}`) },
            `app v${n}`,
          )
          // the widget's router loads its route again: it still renders its own
          await app.evaluate('window.__WIDGET_ROUTER__.invalidate()')
          expect({
            app: await app.page.text('#app'),
            widget: await app.page.text('#widget'),
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `app v${n}`,
            widget: 'widget',
            errors: [],
            loads: 1,
          })
        }
      },
    )

    it(
      "an edit of the app tree's lazy route file shows in the app's router; the other tree's keeps its code",
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          onTestFinished,
          moreRouteTrees: [widgetTree],
          files: {
            'main.tsx': twoTrees(target),
            'routes/index.tsx': emptyRoute(target),
            'routes/index.lazy.tsx': lazyFile(target, 'app v1'),
            'widget-routes/__root.tsx': root(target),
            'widget-routes/index.tsx': emptyRoute(target),
            'widget-routes/index.lazy.tsx': lazyFile(
              target,
              'widget',
              'Widget',
            ),
          },
          ready: 'app v1',
        })
        await app.page.waitForText('widget', { selector: '#widget' })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.lazy.tsx': lazyFile(target, `app v${n}`) },
            `app v${n}`,
          )
          await app.evaluate('window.__WIDGET_ROUTER__.invalidate()')
          expect({
            app: await app.page.text('#app'),
            widget: await app.page.text('#widget'),
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `app v${n}`,
            widget: 'widget',
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)
