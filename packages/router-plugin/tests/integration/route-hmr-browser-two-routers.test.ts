/**
 * Route HMR on a page with two routers (SPEC J3.3): the app's file-based
 * router and a widget's code router, both with an eager route `/`. An edit of
 * the app's route file shows in the app's route, in the document the page
 * loaded, whichever router the entry creates last, and leaves the widget's
 * route as it is. (Lazy routes: route-hmr-browser-two-routers-lazy.test.ts.)
 */
import { describe } from 'vitest'
import { it } from '../test'
import {
  hosts,
  mount,
  read,
  loaderRoute as shownRoute,
  twoRouters,
} from './route-hmr-two-routers-cases'
import type { TargetFramework } from '../route-app'

const timeout = 90_000

const loaderRoute = (target: TargetFramework, version: string) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  loader: () => 'data ${version}',
  component: Page,
})
function Page() {
  const data = Route.useLoaderData()
  return <p>app {data${read[target]}}</p>
}
`

describe.each(hosts)(
  '$bundler $target: two routers on a page',
  ({ bundler, target }) => {
    it.for([
      { order: 'widget-last', autoCodeSplitting: true },
      { order: 'widget-last', autoCodeSplitting: false },
      { order: 'widget-first', autoCodeSplitting: true },
    ] as const)(
      "an eager route file's loader edits show in the app's route ($order, autoCodeSplitting: $autoCodeSplitting)",
      { timeout },
      async ({ order, autoCodeSplitting }, { expect, openRouteHmrPage }) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          pluginOptions: { autoCodeSplitting },
          files: {
            'main.tsx': twoRouters(target, 'eager', order),
            'routes/index.tsx': loaderRoute(target, 'v1'),
          },
          ready: 'app data v1',
        })
        await app.page.waitForText('Widget widget data', {
          selector: '#widget',
        })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': loaderRoute(target, `v${n}`) },
            `app data v${n}`,
          )
          expect({
            app: await app.page.text('#app'),
            widget: await app.page.text('#widget'),
            errors: result.errors,
            loads: app.loads(),
          }).toEqual({
            app: `app data v${n}`,
            widget: 'Widget widget data',
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)

const frameworkImport: Record<TargetFramework, string> = {
  react: `import { createRoot } from 'react-dom/client'`,
  solid: `import { render } from 'solid-js/web'`,
  vue: `import { createApp } from 'vue'`,
}

/** The app's router, and a widget's router whose constructor throws (two code routes of one path), caught. */
const brokenWidget = (target: TargetFramework) => `${frameworkImport[target]}
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/${target}-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
;(window as any).__APP_ROUTER__ = router
const widgetRoot = createRootRoute()
const a = createRoute({ getParentRoute: () => widgetRoot, path: '/item' })
const b = createRoute({ getParentRoute: () => widgetRoot, path: '/item' })
try {
  createRouter({ routeTree: widgetRoot.addChildren([a, b]), history: createMemoryHistory({ initialEntries: ['/'] }) })
} catch {
  // the widget is broken; the app goes on
}
${mount[target]("document.getElementById('app')!", 'router')}
`

// Review of the implementation (Fable re-check R1): a router registers for
// route HMR in its first update, before it read its route tree
describe.each(hosts)(
  '$bundler $target: a second router whose constructor threw',
  ({ bundler, target }) => {
    it(
      "leaves the app's route edits in place",
      { timeout },
      async ({ expect, openRouteHmrPage }) => {
        const app = await openRouteHmrPage({
          bundler,
          target,
          files: {
            'main.tsx': brokenWidget(target),
            'routes/index.tsx': shownRoute(target, 'v1'),
          },
          ready: 'v1',
        })
        for (const n of [2, 3]) {
          const result = await app.edit(
            { 'routes/index.tsx': shownRoute(target, `v${n}`) },
            `v${n}`,
          )
          expect({ errors: result.errors, loads: app.loads() }).toEqual({
            errors: [],
            loads: 1,
          })
        }
      },
    )
  },
)
